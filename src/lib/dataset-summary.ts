import type { DatasetStats } from './dataset-stats';

export interface SummaryBullet {
  status: 'ok' | 'warn' | 'err';
  text: string;
}

export interface DatasetSummary {
  tldr: string;
  status: 'ok' | 'warn' | 'err';
  bullets: SummaryBullet[];
}

interface PresetLike {
  name?: string;
  rules?: { maxTokensPerExample?: number };
  pricing?: { trainingPerMTokens?: number };
}

interface ValidationErrorLike {
  line: number;
  code: string;
  message: string;
  suggestion?: string;
}

function pctStr(n: number): string {
  return (n * 100).toFixed(n < 0.01 ? 2 : n < 0.1 ? 1 : 0) + '%';
}

export function generateDatasetSummary(
  s: DatasetStats,
  preset: PresetLike | null,
  validationErrors: ValidationErrorLike[] = [],
): DatasetSummary {
  const bullets: SummaryBullet[] = [];
  const total = s.recordCount;

  // Edge: empty dataset
  if (total === 0) {
    return { tldr: 'No records to analyse yet — paste JSONL into the editor.', status: 'ok', bullets: [] };
  }

  // 0. Preset/validator violations — these block training even if data parses,
  // so they take priority. Surface up to 3, then a count for the rest.
  if (validationErrors.length > 0) {
    // Dataset-level errors (line === 0) describe the whole dataset (record
    // count too low, etc.) — they always block training so show them as err.
    const datasetLevel = validationErrors.filter(e => e.line === 0);
    const perLine = validationErrors.filter(e => e.line > 0);

    for (const e of datasetLevel.slice(0, 2)) {
      bullets.push({ status: 'err', text: e.message + (e.suggestion ? ` — ${e.suggestion}` : '') });
    }
    if (datasetLevel.length > 2) {
      bullets.push({ status: 'err', text: `${datasetLevel.length - 2} more dataset-level error${datasetLevel.length - 2 === 1 ? '' : 's'} blocking training.` });
    }

    if (perLine.length > 0) {
      const firstFew = perLine.slice(0, 3).map(e => `line ${e.line}`).join(', ');
      const more = perLine.length > 3 ? ` + ${perLine.length - 3} more` : '';
      bullets.push({
        status: 'err',
        text: `${perLine.length} preset-validation error${perLine.length === 1 ? '' : 's'} (${firstFew}${more}) — open the Problems panel for details.`,
      });
    }
  }

  // 1. Invalid lines
  if (s.invalidCount > 0) {
    const pct = s.invalidCount / (total + s.invalidCount);
    const sev: 'err' | 'warn' = pct > 0.05 ? 'err' : 'warn';
    bullets.push({
      status: sev,
      text: `${s.invalidCount} of ${total + s.invalidCount} lines (${pctStr(pct)}) failed to parse as JSON — fix these before training.`,
    });
  }

  // 2. Over-budget records
  if (s.overBudget.count > 0) {
    const pct = s.overBudget.count / total;
    const sev: 'err' | 'warn' = pct > 0.05 ? 'err' : 'warn';
    bullets.push({
      status: sev,
      text: `${s.overBudget.count} records (${pctStr(pct)}) exceed the model's ${s.overBudget.limit.toLocaleString()}-token budget — they will be truncated or rejected.`,
    });
  }

  // 3. Token length headline (always include for shape)
  if (s.tokenLengths.median > 0) {
    bullets.push({
      status: 'ok',
      text: `Median record is ${s.tokenLengths.median.toLocaleString()} tokens (min ${s.tokenLengths.min}, p95 ${s.tokenLengths.p95}, max ${s.tokenLengths.max.toLocaleString()}).`,
    });
  }

  // 4. Role distribution
  if (s.roles.total > 0) {
    if (!s.roles.hasSystem) {
      bullets.push({ status: 'err', text: 'No system turns anywhere — most chat fine-tuners expect at least an empty system message.' });
    } else {
      const userCount = s.roles.counts['user'] ?? 0;
      const assistantCount = s.roles.counts['assistant'] ?? 0;
      if (userCount > 0 && assistantCount > userCount * 3) {
        bullets.push({ status: 'err', text: `Assistant turns are ${(assistantCount / userCount).toFixed(1)}× user turns — the model has far more to say than humans prompt it.` });
      } else if (userCount > 0 && assistantCount > userCount * 1.5) {
        bullets.push({ status: 'warn', text: `Assistant turns are ${(assistantCount / userCount).toFixed(1)}× user turns — mild imbalance.` });
      }
    }
  }

  // 5. Duplicates
  if (s.duplicates.exact > 0) {
    const pct = s.duplicates.exact / total;
    const sev: 'err' | 'warn' = pct > 0.05 ? 'err' : 'warn';
    bullets.push({
      status: sev,
      text: `${s.duplicates.exact} exact duplicate records (${pctStr(pct)}) — fine-tuning on duplicates inflates loss on those examples.`,
    });
  } else if (s.duplicates.normalized > 0) {
    bullets.push({
      status: 'warn',
      text: `${s.duplicates.normalized} near-duplicate records after trim+lowercase normalisation — worth a closer look.`,
    });
  }

  // 6. Refusal phrases
  if (s.refusal.count > 0 && s.refusal.pctOfAssistant > 0.05) {
    const sev: 'err' | 'warn' = s.refusal.pctOfAssistant > 0.20 ? 'err' : 'warn';
    bullets.push({
      status: sev,
      text: `${s.refusal.count} assistant responses (${pctStr(s.refusal.pctOfAssistant)}) contain refusal patterns like "I cannot" or "As an AI…" — your fine-tune will likely over-refuse.`,
    });
  }

  // 7. System prompt diversity
  if (s.systemPrompt.totalWithSystem > 0 && s.systemPrompt.dominantPct > 0.95 && total > 5) {
    bullets.push({
      status: 'warn',
      text: `${pctStr(s.systemPrompt.dominantPct)} of records share the same system prompt — fine if this is a single-purpose dataset, otherwise a sign of templated generation.`,
    });
  }

  // 8. Assistant length
  if (s.assistantLength.count > 0) {
    if (s.assistantLength.median < 20) {
      bullets.push({ status: 'warn', text: `Assistant answers are very short (median ${s.assistantLength.median} chars) — the model will learn to give terse responses.` });
    } else if (s.assistantLength.median > 3000) {
      bullets.push({ status: 'warn', text: `Assistant answers are very long (median ${s.assistantLength.median.toLocaleString()} chars) — the model will learn to be verbose.` });
    }
  }

  // 9. Quality flags
  if (s.qualityFlags.controlChars > 0) {
    bullets.push({ status: 'err', text: `${s.qualityFlags.controlChars} records contain control characters — likely corrupted text that will confuse the tokenizer.` });
  }
  if (s.qualityFlags.promptInjection > 0) {
    bullets.push({ status: 'err', text: `${s.qualityFlags.promptInjection} records contain prompt-injection patterns ("ignore previous instructions", etc.) — review before training.` });
  }
  if (s.qualityFlags.htmlEscapes > 5) {
    bullets.push({ status: 'warn', text: `${s.qualityFlags.htmlEscapes} records contain HTML escapes (&amp;, &lt;) — your source may be HTML rather than plain text.` });
  }

  // 10. Cost
  const perM = preset?.pricing?.trainingPerMTokens;
  if (perM && perM > 0 && s.tokenLengths.mean > 0) {
    const totalTokens = s.tokenLengths.mean * total;
    const cost = (totalTokens / 1_000_000) * perM;
    bullets.push({
      status: 'ok',
      text: `Training will cost roughly $${cost.toFixed(2)} at the active preset (${(totalTokens / 1000).toFixed(0)}k tokens × $${perM}/M).`,
    });
  }

  // 11. Vocabulary breadth (positive signal only)
  if (s.vocabRichness.totalTokens > 1000 && s.vocabRichness.typeTokenRatio > 0.15) {
    bullets.push({ status: 'ok', text: `Vocabulary is varied (${pctStr(s.vocabRichness.typeTokenRatio)} unique-to-total ratio across ${s.vocabRichness.totalTokens.toLocaleString()} words) — good topic breadth.` });
  } else if (s.vocabRichness.totalTokens > 1000 && s.vocabRichness.typeTokenRatio < 0.05) {
    bullets.push({ status: 'warn', text: `Vocabulary is very repetitive (${pctStr(s.vocabRichness.typeTokenRatio)} unique-to-total ratio) — narrow topic range.` });
  }

  // Sort: err first, warn second, ok last (keep stable order within group)
  bullets.sort((a, b) => {
    const order = { err: 0, warn: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  // Cap at 6 bullets so the summary stays scannable
  const trimmed = bullets.slice(0, 6);

  // TLDR + overall status
  const errCount = trimmed.filter(b => b.status === 'err').length;
  const warnCount = trimmed.filter(b => b.status === 'warn').length;
  let tldr: string;
  let status: 'ok' | 'warn' | 'err';

  if (errCount > 0) {
    status = 'err';
    tldr = `${total.toLocaleString()} records with ${errCount} critical issue${errCount === 1 ? '' : 's'} — review the red findings before training.`;
  } else if (warnCount > 0) {
    status = 'warn';
    tldr = `${total.toLocaleString()} records ready to train, with ${warnCount} caveat${warnCount === 1 ? '' : 's'} worth a quick look.`;
  } else {
    status = 'ok';
    tldr = `${total.toLocaleString()} records, clean and ready to train.`;
  }

  return { tldr, status, bullets: trimmed };
}
