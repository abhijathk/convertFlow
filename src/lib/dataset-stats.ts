import { approximateTokens } from './tokenize';

export interface DatasetStats {
  recordCount: number;
  emptyCount: number;
  invalidCount: number;
  tokenLengths: { min: number; mean: number; median: number; p95: number; p99: number; max: number };
  overBudget: { count: number; limit: number; firstLine: number | null };
  messageCounts: { buckets: Record<string, number> };
  roles: { counts: Record<string, number>; total: number; hasSystem: boolean };
  content: { avgChars: number; emptyContentCount: number; veryShort: number; veryLong: number };
  duplicates: { exact: number; normalized: number; samples: Array<{ preview: string; count: number; firstLine: number }> };
  languageHint: 'mostly-ascii' | 'mostly-non-ascii' | 'cjk' | 'mixed';
  assistantLength: {
    count: number;
    min: number;
    median: number;
    mean: number;
    p95: number;
    max: number;
  };
  systemPrompt: {
    uniqueCount: number;
    totalWithSystem: number;
    dominantText: string | null;
    dominantPct: number;
  };
  refusal: {
    count: number;
    pctOfAssistant: number;
    sampleLines: number[];
  };
  qualityFlags: {
    controlChars: number;
    htmlEscapes: number;
    promptInjection: number;
  };
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topNgrams: {
    unigrams: Array<{ word: string; count: number }>;
    bigrams: Array<{ phrase: string; count: number }>;
  };
  trainingTimeEstimate: {
    minutes: number;
    basis: string;
  };
  vocabRichness: {
    uniqueTokens: number;
    totalTokens: number;
    typeTokenRatio: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFUSAL_PATTERNS = [
  /\bI (?:cannot|can't|cant|am not able|am unable) (?:help|assist|provide|do|answer|share|comply|fulfill)/i,
  /\bI(?:'|')?m sorry,? but\b/i,
  /\bI(?:'|')?m sorry,? (?:I (?:cannot|can't))/i,
  /\bI don(?:'|')?t have (?:access|the ability|permission)/i,
  /\bAs an AI(?: language model)?,?\s+I/i,
  /\bI(?:'|')?m (?:just|only) an AI/i,
  /\bunable to (?:assist|help|provide|comply)/i,
  /\b(?:against|violates|contrary to) (?:my|the) (?:guidelines|policies|principles|programming)/i,
];

const INJECTION_PATTERNS = [
  /\bignore (?:all )?(?:previous|prior|the above) (?:instructions|prompts|commands)/i,
  /\bdisregard (?:all )?(?:previous|prior) (?:instructions|prompts)/i,
  /\bforget (?:everything|all|previous|prior)/i,
  /\b(?:you are now|you'?re now|new (?:instructions|persona|role)):/i,
  /\bsystem prompt[:\s]+/i,
  /\bjailbreak\b/i,
  /\bDAN mode\b/i,
];

const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const HTML_ESCAPE_RE = /&(?:amp|lt|gt|quot|nbsp|apos|#\d{1,5}|#x[0-9a-fA-F]{1,5});/;

const POS_WORDS = new Set([
  'happy', 'great', 'wonderful', 'excellent', 'good', 'love', 'enjoy', 'positive', 'amazing', 'helpful',
  'thanks', 'thank', 'please', 'best', 'better', 'nice', 'glad', 'pleased', 'recommend', 'useful',
]);

const NEG_WORDS = new Set([
  'sad', 'bad', 'terrible', 'awful', 'hate', 'worst', 'poor', 'wrong', 'error', 'fail', 'failure',
  'cannot', "can't", 'sorry', 'unable', 'no', 'never', 'reject', 'refuse', 'impossible',
]);

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'but', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
  'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'not', 'no', 'yes', 'if', 'then', 'so', 'than', 'too', 'very', 'just',
]);

const TOKENS_PER_MINUTE = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function bucketMessageCount(n: number): string {
  if (n <= 3) return String(n);
  if (n <= 5) return '4-5';
  if (n <= 10) return '6-10';
  return '11+';
}

function detectLanguage(samples: string[]): DatasetStats['languageHint'] {
  let totalChars = 0;
  let nonAsciiChars = 0;
  let cjkChars = 0;

  for (const s of samples) {
    const slice = s.slice(0, 200);
    for (const ch of slice) {
      const code = ch.codePointAt(0) ?? 0;
      totalChars++;
      if (code > 127) {
        nonAsciiChars++;
        if (
          (code >= 0x4e00 && code <= 0x9fff) ||
          (code >= 0x3040 && code <= 0x30ff) ||
          (code >= 0xac00 && code <= 0xd7af)
        ) {
          cjkChars++;
        }
      }
    }
  }

  if (totalChars === 0) return 'mostly-ascii';
  const nonAsciiRatio = nonAsciiChars / totalChars;
  const cjkRatio = cjkChars / totalChars;

  if (cjkRatio > 0.15) return 'cjk';
  if (nonAsciiRatio < 0.05) return 'mostly-ascii';
  if (nonAsciiRatio > 0.5) return 'mostly-non-ascii';
  return 'mixed';
}

/** Tokenise a string into meaningful words for n-gram / vocab analysis. */
function contentTokens(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

export function computeDatasetStats(
  content: string,
  preset: { rules: { maxTokensPerExample: number } }
): DatasetStats {
  const lines = content.split('\n');
  const limit = preset.rules.maxTokensPerExample;

  let recordCount = 0;
  let emptyCount = 0;
  let invalidCount = 0;

  const tokenArr: number[] = [];
  let tokenSum = 0;
  let overBudgetCount = 0;
  let overBudgetFirstLine: number | null = null;

  const msgCountBuckets: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4-5': 0, '6-10': 0, '11+': 0 };
  const roleCounts: Record<string, number> = {};
  let totalRoles = 0;
  let hasSystem = false;

  let totalChars = 0;
  const charArr: number[] = [];
  let emptyContentCount = 0;
  let veryShort = 0;
  let veryLong = 0;

  const exactLines = new Map<string, number[]>();
  const normLines = new Map<string, number[]>();

  const langSamplePool: string[] = [];
  const langSampleSize = 50;

  // New accumulators
  const assistantLengths: number[] = [];
  const systemPromptMap = new Map<string, number>();
  let totalWithSystem = 0;
  let assistantTurnCount = 0;
  let refusalCount = 0;
  const refusalSampleLines: number[] = [];

  let qualityControlChars = 0;
  let qualityHtmlEscapes = 0;
  let qualityPromptInjection = 0;

  let sentimentPositive = 0;
  let sentimentNegative = 0;
  let sentimentNeutral = 0;

  const unigramCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();

  // Vocab richness across ALL content
  const vocabSet = new Set<string>();
  let vocabTotalTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) {
      emptyCount++;
      continue;
    }
    recordCount++;
    const lineNumber = i + 1;

    let obj: Record<string, unknown> | null = null;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      invalidCount++;
    }

    const tok = approximateTokens(raw);
    tokenArr.push(tok);
    tokenSum += tok;
    if (tok > limit) {
      overBudgetCount++;
      if (overBudgetFirstLine === null) overBudgetFirstLine = lineNumber;
    }

    const chars = raw.length;
    totalChars += chars;
    charArr.push(chars);
    if (chars === 0 || !raw.trim()) {
      emptyContentCount++;
    } else if (chars < 10) {
      veryShort++;
    } else if (chars > 4000) {
      veryLong++;
    }

    // Per-record quality flags (check entire raw line first for injection)
    let recordHasControlChar = false;
    let recordHasHtmlEscape = false;
    let recordHasInjection = false;

    if (obj && Array.isArray((obj as { messages?: unknown }).messages)) {
      const messages = (obj as { messages: unknown[] }).messages;
      const bucket = bucketMessageCount(messages.length);
      msgCountBuckets[bucket] = (msgCountBuckets[bucket] ?? 0) + 1;

      let recordSystemContent: string | null = null;

      for (const msg of messages) {
        if (msg && typeof msg === 'object') {
          const m = msg as { role?: string; content?: string };
          const role = typeof m.role === 'string' ? m.role : 'other';
          roleCounts[role] = (roleCounts[role] ?? 0) + 1;
          totalRoles++;
          if (role === 'system') hasSystem = true;

          const msgContent = m.content ?? '';
          if (typeof msgContent === 'string') {
            if (!msgContent.trim()) {
              emptyContentCount++;
            } else if (msgContent.length < 10) {
              veryShort++;
            } else if (msgContent.length > 4000) {
              veryLong++;
            }

            // Quality flags — per message content
            if (!recordHasControlChar && CONTROL_CHAR_RE.test(msgContent)) {
              recordHasControlChar = true;
            }
            if (!recordHasHtmlEscape && HTML_ESCAPE_RE.test(msgContent)) {
              recordHasHtmlEscape = true;
            }
            if (!recordHasInjection && INJECTION_PATTERNS.some(p => p.test(msgContent))) {
              recordHasInjection = true;
            }

            // Vocab richness accumulation (all roles)
            const allTokens = msgContent.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            for (const t of allTokens) {
              vocabSet.add(t);
              vocabTotalTokens++;
            }

            // Role-specific analysis
            if (role === 'system') {
              if (recordSystemContent === null) {
                recordSystemContent = msgContent;
              }
            }

            if (role === 'assistant') {
              assistantTurnCount++;
              assistantLengths.push(msgContent.length);

              // Refusal detection
              const isRefusal = REFUSAL_PATTERNS.some(p => p.test(msgContent));
              if (isRefusal) {
                refusalCount++;
                if (refusalSampleLines.length < 3) {
                  refusalSampleLines.push(lineNumber);
                }
              }

              // Sentiment
              const words = msgContent.toLowerCase().split(/\W+/);
              let posScore = 0;
              let negScore = 0;
              for (const w of words) {
                if (POS_WORDS.has(w)) posScore++;
                if (NEG_WORDS.has(w)) negScore++;
              }
              if (posScore > negScore) sentimentPositive++;
              else if (negScore > posScore) sentimentNegative++;
              else sentimentNeutral++;

              // N-grams
              const tokens = contentTokens(msgContent);
              for (const t of tokens) {
                unigramCounts.set(t, (unigramCounts.get(t) ?? 0) + 1);
              }
              for (let j = 0; j + 1 < tokens.length; j++) {
                const bigram = `${tokens[j]} ${tokens[j + 1]}`;
                bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
              }
            }
          }
        }
      }

      // System prompt tracking (per record)
      if (recordSystemContent !== null) {
        totalWithSystem++;
        const truncated = recordSystemContent.slice(0, 80);
        systemPromptMap.set(truncated, (systemPromptMap.get(truncated) ?? 0) + 1);
      }
    }

    // Accumulate record-level quality flags
    if (recordHasControlChar) qualityControlChars++;
    if (recordHasHtmlEscape) qualityHtmlEscapes++;
    if (recordHasInjection) qualityPromptInjection++;

    const existing = exactLines.get(raw);
    if (existing) {
      existing.push(lineNumber);
    } else {
      exactLines.set(raw, [lineNumber]);
    }

    const normalized = raw.trim().toLowerCase();
    const normExisting = normLines.get(normalized);
    if (normExisting) {
      normExisting.push(lineNumber);
    } else {
      normLines.set(normalized, [lineNumber]);
    }

    if (langSamplePool.length < langSampleSize || Math.random() < langSampleSize / recordCount) {
      if (langSamplePool.length < langSampleSize) {
        langSamplePool.push(raw);
      } else {
        const replaceIdx = Math.floor(Math.random() * langSampleSize);
        langSamplePool[replaceIdx] = raw;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Post-loop aggregation
  // ---------------------------------------------------------------------------

  tokenArr.sort((a, b) => a - b);
  const tokenMin = tokenArr[0] ?? 0;
  const tokenMax = tokenArr[tokenArr.length - 1] ?? 0;
  const tokenMean = tokenArr.length ? Math.round(tokenSum / tokenArr.length) : 0;
  const tokenMedian = percentile(tokenArr, 50);
  const tokenP95 = percentile(tokenArr, 95);
  const tokenP99 = percentile(tokenArr, 99);

  const avgChars = charArr.length ? Math.round(totalChars / charArr.length) : 0;

  let exactDupCount = 0;
  let normDupCount = 0;
  const dupSamples: Array<{ preview: string; count: number; firstLine: number }> = [];

  for (const [key, lineNums] of exactLines) {
    if (lineNums.length > 1) {
      exactDupCount += lineNums.length - 1;
      if (dupSamples.length < 3) {
        dupSamples.push({
          preview: key.slice(0, 80),
          count: lineNums.length,
          firstLine: lineNums[0],
        });
      }
    }
  }

  for (const [, lineNums] of normLines) {
    if (lineNums.length > 1) {
      normDupCount += lineNums.length - 1;
    }
  }

  // Assistant length stats
  assistantLengths.sort((a, b) => a - b);
  const aLenMin = assistantLengths[0] ?? 0;
  const aLenMax = assistantLengths[assistantLengths.length - 1] ?? 0;
  const aLenMean = assistantLengths.length
    ? Math.round(assistantLengths.reduce((s, v) => s + v, 0) / assistantLengths.length)
    : 0;
  const aLenMedian = percentile(assistantLengths, 50);
  const aLenP95 = percentile(assistantLengths, 95);

  // System prompt stats
  let dominantText: string | null = null;
  let dominantCount = 0;
  for (const [text, count] of systemPromptMap) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantText = text;
    }
  }
  const dominantPct = recordCount > 0 ? dominantCount / recordCount : 0;

  // Refusal stats
  const pctOfAssistant = assistantTurnCount > 0 ? refusalCount / assistantTurnCount : 0;

  // Top n-grams — sort desc, take top 10
  const topUnigrams = [...unigramCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  const topBigrams = [...bigramCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  // Training time estimate
  const trainingMinutes = Math.max(1, Math.round(tokenSum / TOKENS_PER_MINUTE));

  // Vocabulary richness
  const uniqueTokens = vocabSet.size;
  const typeTokenRatio = uniqueTokens / Math.max(1, vocabTotalTokens);

  return {
    recordCount,
    emptyCount,
    invalidCount,
    tokenLengths: { min: tokenMin, mean: tokenMean, median: tokenMedian, p95: tokenP95, p99: tokenP99, max: tokenMax },
    overBudget: { count: overBudgetCount, limit, firstLine: overBudgetFirstLine },
    messageCounts: { buckets: msgCountBuckets },
    roles: { counts: roleCounts, total: totalRoles, hasSystem },
    content: { avgChars, emptyContentCount, veryShort, veryLong },
    duplicates: { exact: exactDupCount, normalized: normDupCount, samples: dupSamples },
    languageHint: detectLanguage(langSamplePool),
    assistantLength: {
      count: assistantLengths.length,
      min: aLenMin,
      median: aLenMedian,
      mean: aLenMean,
      p95: aLenP95,
      max: aLenMax,
    },
    systemPrompt: {
      uniqueCount: systemPromptMap.size,
      totalWithSystem,
      dominantText,
      dominantPct,
    },
    refusal: {
      count: refusalCount,
      pctOfAssistant,
      sampleLines: refusalSampleLines,
    },
    qualityFlags: {
      controlChars: qualityControlChars,
      htmlEscapes: qualityHtmlEscapes,
      promptInjection: qualityPromptInjection,
    },
    sentiment: {
      positive: sentimentPositive,
      neutral: sentimentNeutral,
      negative: sentimentNegative,
    },
    topNgrams: {
      unigrams: topUnigrams,
      bigrams: topBigrams,
    },
    trainingTimeEstimate: {
      minutes: trainingMinutes,
      basis: '≈ 5k tokens/minute on a single A100',
    },
    vocabRichness: {
      uniqueTokens,
      totalTokens: vocabTotalTokens,
      typeTokenRatio,
    },
  };
}
