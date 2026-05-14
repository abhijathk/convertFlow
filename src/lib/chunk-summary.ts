import type { ChunkStats } from './chunk-stats';

export interface SummaryBullet {
  status: 'ok' | 'warn' | 'err';
  text: string;
}

export interface ChunkSummary {
  tldr: string;
  status: 'ok' | 'warn' | 'err';
  bullets: SummaryBullet[];
}

function pctStr(n: number): string {
  return (n * 100).toFixed(n < 0.01 ? 2 : n < 0.1 ? 1 : 0) + '%';
}

export function generateChunkSummary(s: ChunkStats): ChunkSummary {
  const bullets: SummaryBullet[] = [];

  if (s.totalChunks === 0) {
    return { tldr: 'No chunks yet — import a file and click Generate.', status: 'ok', bullets: [] };
  }

  // 1. Token length verdict
  if (s.tokenLengths.median < 64) {
    bullets.push({ status: 'warn', text: `Chunks are very small (median ${s.tokenLengths.median} tokens) — embeddings may underperform on text this short.` });
  } else if (s.tokenLengths.median > 2048) {
    bullets.push({ status: 'warn', text: `Chunks are very large (median ${s.tokenLengths.median.toLocaleString()} tokens) — many embedding models cap below this.` });
  } else {
    bullets.push({ status: 'ok', text: `Chunks average ${s.tokenLengths.median} tokens (range ${s.tokenLengths.min}–${s.tokenLengths.max.toLocaleString()}), a healthy size for embedding.` });
  }

  // 2. Size consistency
  if (s.sizeVariance.cv > 0.7) {
    bullets.push({ status: 'err', text: `Chunk sizes are wildly inconsistent (CV ${(s.sizeVariance.cv * 100).toFixed(0)}%) — retrieval quality suffers when chunks vary this much.` });
  } else if (s.sizeVariance.cv > 0.4) {
    bullets.push({ status: 'warn', text: `Chunk sizes vary somewhat (CV ${(s.sizeVariance.cv * 100).toFixed(0)}%) — consider tightening the strategy.` });
  } else if (s.totalChunks > 1) {
    bullets.push({ status: 'ok', text: `Chunk sizes are consistent (CV ${(s.sizeVariance.cv * 100).toFixed(0)}%).` });
  }

  // 3. Coverage
  if (s.coverage.coveragePct < 0.80) {
    bullets.push({ status: 'err', text: `Only ${pctStr(s.coverage.coveragePct)} of the source is in any chunk — you're losing ${pctStr(1 - s.coverage.coveragePct)} of your data.` });
  } else if (s.coverage.coveragePct < 0.95) {
    bullets.push({ status: 'warn', text: `${pctStr(s.coverage.coveragePct)} of source covered with ${s.coverage.gapCount} gap${s.coverage.gapCount === 1 ? '' : 's'} — some text is not in any chunk.` });
  } else {
    bullets.push({ status: 'ok', text: `${pctStr(s.coverage.coveragePct)} of the source is covered with no significant gaps.` });
  }

  // 4. Overlap
  if (s.overlap.overlapPct > 0.4) {
    bullets.push({ status: 'warn', text: `Overlap is ${pctStr(s.overlap.overlapPct)} (${s.overlap.tokenOverlap.toLocaleString()} duplicated tokens) — you'll pay to embed the same text multiple times.` });
  } else if (s.overlap.overlapPct > 0.05) {
    bullets.push({ status: 'ok', text: `Overlap is ${pctStr(s.overlap.overlapPct)} — a healthy retrieval buffer.` });
  }

  // 5. Density
  if (s.lowDensityCount > s.totalChunks * 0.2) {
    bullets.push({ status: 'err', text: `${s.lowDensityCount} of ${s.totalChunks} chunks (${pctStr(s.lowDensityCount / s.totalChunks)}) are low-density — mostly whitespace or repetition.` });
  } else if (s.lowDensityCount > 0) {
    bullets.push({ status: 'warn', text: `${s.lowDensityCount} chunk${s.lowDensityCount === 1 ? '' : 's'} have low density — worth spot-checking for sparse content.` });
  }

  // 6. Composition
  if (s.imageChunks > 0) {
    bullets.push({ status: 'ok', text: `${s.imageChunks} image chunk${s.imageChunks === 1 ? '' : 's'} + ${s.textChunks} text chunk${s.textChunks === 1 ? '' : 's'}.` });
  }

  // 7. Topic breadth
  if (s.keywords.uniqueCount > 50) {
    bullets.push({ status: 'ok', text: `${s.keywords.uniqueCount.toLocaleString()} unique keywords across chunks — wide topic coverage.` });
  } else if (s.keywords.uniqueCount > 0 && s.keywords.uniqueCount < 10 && s.totalChunks > 5) {
    bullets.push({ status: 'warn', text: `Only ${s.keywords.uniqueCount} unique keywords across ${s.totalChunks} chunks — content may be very narrow.` });
  }

  // Sort and cap
  bullets.sort((a, b) => {
    const order = { err: 0, warn: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });
  const trimmed = bullets.slice(0, 6);

  // TLDR
  const errCount = trimmed.filter(b => b.status === 'err').length;
  const warnCount = trimmed.filter(b => b.status === 'warn').length;
  let tldr: string;
  let status: 'ok' | 'warn' | 'err';
  if (errCount > 0) {
    status = 'err';
    tldr = `${s.totalChunks.toLocaleString()} chunks (${s.totalTokens.toLocaleString()} tokens) — ${errCount} critical issue${errCount === 1 ? '' : 's'} before embedding.`;
  } else if (warnCount > 0) {
    status = 'warn';
    tldr = `${s.totalChunks.toLocaleString()} chunks (${s.totalTokens.toLocaleString()} tokens) — ${warnCount} caveat${warnCount === 1 ? '' : 's'} to consider.`;
  } else {
    status = 'ok';
    tldr = `${s.totalChunks.toLocaleString()} chunks (${s.totalTokens.toLocaleString()} tokens), ready to embed.`;
  }

  return { tldr, status, bullets: trimmed };
}
