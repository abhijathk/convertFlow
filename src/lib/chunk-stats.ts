import type { ChunkMeta } from '../stores/chunkState';

export interface ChunkStats {
  // Tokens
  totalChunks: number;
  totalTokens: number;
  tokenLengths: { min: number; mean: number; median: number; p95: number; max: number };
  sizeVariance: { stdev: number; cv: number }; // cv = stdev/mean (coefficient of variation)
  // Density
  density: { mean: number; min: number; max: number };
  lowDensityCount: number; // chunks with density_score < 0.3
  // Char stats
  totalChars: number;
  // Overlap
  overlap: {
    tokenOverlap: number;  // sum of approximate overlap tokens between adjacent chunks
    overlapPct: number;    // tokenOverlap / totalTokens, 0-1
  };
  // Coverage
  coverage: {
    sourceLength: number;
    coveredLength: number;  // characters spanned by at least one chunk
    coveragePct: number;    // coveredLength / sourceLength, 0-1
    gapCount: number;       // number of gaps between chunk ranges
  };
  // Image vs text
  imageChunks: number;
  textChunks: number;
  // Keywords
  keywords: {
    uniqueCount: number;
    totalKeywords: number;
    topKeywords: Array<{ keyword: string; count: number }>; // top 10 across all chunks
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export function computeChunkStats(chunks: ChunkMeta[], sourceText: string): ChunkStats {
  const totalChunks = chunks.length;
  if (totalChunks === 0) {
    return {
      totalChunks: 0, totalTokens: 0,
      tokenLengths: { min: 0, mean: 0, median: 0, p95: 0, max: 0 },
      sizeVariance: { stdev: 0, cv: 0 },
      density: { mean: 0, min: 0, max: 0 }, lowDensityCount: 0,
      totalChars: 0,
      overlap: { tokenOverlap: 0, overlapPct: 0 },
      coverage: { sourceLength: sourceText.length, coveredLength: 0, coveragePct: 0, gapCount: 0 },
      imageChunks: 0, textChunks: 0,
      keywords: { uniqueCount: 0, totalKeywords: 0, topKeywords: [] },
    };
  }

  const tokens = chunks.map(c => c.approx_tokens).sort((a, b) => a - b);
  const totalTokens = tokens.reduce((s, v) => s + v, 0);
  const mean = totalTokens / totalChunks;
  const min = tokens[0];
  const max = tokens[tokens.length - 1];
  const median = percentile(tokens, 50);
  const p95 = percentile(tokens, 95);
  const variance = tokens.reduce((s, v) => s + (v - mean) * (v - mean), 0) / totalChunks;
  const stdev = Math.sqrt(variance);
  const cv = mean === 0 ? 0 : stdev / mean;

  const densities = chunks.map(c => c.density_score);
  const densityMean = densities.reduce((s, v) => s + v, 0) / totalChunks;
  const densityMin = Math.min(...densities);
  const densityMax = Math.max(...densities);
  const lowDensityCount = densities.filter(d => d < 0.3).length;

  const totalChars = chunks.reduce((s, c) => s + c.char_count, 0);

  // Image / text split
  const imageChunks = chunks.filter(c => !!c.image_data).length;
  const textChunks = totalChunks - imageChunks;

  // Overlap — sum overlapping character ranges between adjacent chunks, convert
  // to approximate tokens (chars/4 as a rough proxy)
  const sortedByOffset = [...chunks].sort((a, b) => a.startOffset - b.startOffset);
  let overlapChars = 0;
  for (let i = 1; i < sortedByOffset.length; i++) {
    const prev = sortedByOffset[i - 1];
    const curr = sortedByOffset[i];
    if (curr.startOffset < prev.endOffset) {
      overlapChars += prev.endOffset - curr.startOffset;
    }
  }
  const tokenOverlap = Math.round(overlapChars / 4);
  const overlapPct = totalTokens === 0 ? 0 : tokenOverlap / totalTokens;

  // Coverage — merge chunk ranges and measure covered length / gap count
  const sourceLength = sourceText.length;
  const ranges = sortedByOffset.map(c => ({ start: c.startOffset, end: c.endOffset }));
  // Merge overlapping ranges
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    if (merged.length === 0 || r.start > merged[merged.length - 1].end) {
      merged.push({ ...r });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    }
  }
  let coveredLength = 0;
  for (const r of merged) coveredLength += r.end - r.start;
  let gapCount = 0;
  if (sourceLength > 0) {
    if (merged.length === 0) {
      gapCount = 1;
    } else {
      if (merged[0].start > 0) gapCount++;
      for (let i = 1; i < merged.length; i++) {
        if (merged[i].start > merged[i - 1].end) gapCount++;
      }
      if (merged[merged.length - 1].end < sourceLength) gapCount++;
    }
  }
  const coveragePct = sourceLength === 0 ? 0 : Math.min(1, coveredLength / sourceLength);

  // Keywords
  const keywordCounts = new Map<string, number>();
  let totalKeywords = 0;
  for (const c of chunks) {
    for (const kw of c.keywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
      totalKeywords++;
    }
  }
  const topKeywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  return {
    totalChunks,
    totalTokens,
    tokenLengths: { min, mean: Math.round(mean), median, p95, max },
    sizeVariance: { stdev: Math.round(stdev), cv },
    density: { mean: densityMean, min: densityMin, max: densityMax },
    lowDensityCount,
    totalChars,
    overlap: { tokenOverlap, overlapPct },
    coverage: { sourceLength, coveredLength, coveragePct, gapCount },
    imageChunks, textChunks,
    keywords: { uniqueCount: keywordCounts.size, totalKeywords, topKeywords },
  };
}
