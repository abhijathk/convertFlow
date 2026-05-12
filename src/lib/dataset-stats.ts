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
}

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

    if (obj && Array.isArray((obj as { messages?: unknown }).messages)) {
      const messages = (obj as { messages: unknown[] }).messages;
      const bucket = bucketMessageCount(messages.length);
      msgCountBuckets[bucket] = (msgCountBuckets[bucket] ?? 0) + 1;

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
          }
        }
      }
    }

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

  tokenArr.sort((a, b) => a - b);
  const tokenMin = tokenArr[0] ?? 0;
  const tokenMax = tokenArr[tokenArr.length - 1] ?? 0;
  const tokenMean = tokenArr.length ? Math.round(tokenArr.reduce((s, v) => s + v, 0) / tokenArr.length) : 0;
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
  };
}
