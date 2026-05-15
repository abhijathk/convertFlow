import type { ChunkMeta } from '../stores/chunkState';
import type { RawChunk } from './chunk';

// Re-export for worker convenience
export type { ChunkMeta };

// Common English stopwords — kept small intentionally
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','as','is','was','are','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'this','that','these','those','it','its','they','them','their','we','our',
  'you','your','he','his','she','her','i','my','me','us','not','no','so',
  'if','then','than','when','where','how','what','which','who','all','any',
  'each','more','some','such','also','into','than','up','out','about','after',
]);

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
}

function contentWords(tokens: string[]): string[] {
  return tokens.filter(w => !STOPWORDS.has(w));
}

// ── Density score ─────────────────────────────────────────────────────────────

export function densityScore(text: string): number {
  const total = tokenize(text);
  if (total.length === 0) return 0;
  const content = contentWords(total);
  // Normalize to 0–1; add a slight penalty for very short chunks
  const ratio = content.length / total.length;
  const lengthBonus = Math.min(1, total.length / 80);
  return Math.round(ratio * lengthBonus * 100) / 100;
}

// ── TF keywords ───────────────────────────────────────────────────────────────

export function tfKeywords(text: string, topN = 6): string[] {
  const tokens = contentWords(tokenize(text));
  if (tokens.length === 0) return [];
  const freq: Record<string, number> = {};
  for (const w of tokens) freq[w] = (freq[w] ?? 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w);
}

// ── SHA-256 hash (truncated to 16 hex chars) ──────────────────────────────────

export async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ── Build full ChunkMeta array ────────────────────────────────────────────────

export interface SourceMeta {
  source?: string;
  source_type?: ChunkMeta['source_type'];
  page_offsets?: number[];   // cumulative char-offset at the start of each page (length === numPages)
  section_map?: string[];    // pre-built: for each chunk index, its heading (md only)
}

/** Binary-search page_offsets to find which 1-indexed page contains charOffset. */
function pageFromOffset(offsets: number[], charOffset: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= charOffset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1; // 1-indexed
}

export async function enrichChunks(
  rawChunks: RawChunk[],
  sourceMeta?: SourceMeta,
  indexOffset = 0,
): Promise<ChunkMeta[]> {
  return Promise.all(
    rawChunks.map(async ({ text: content, startOffset, endOffset }, i) => {
      const hash = await hashText(content);
      const base: ChunkMeta = {
        chunk_id: `chunk-${indexOffset + i + 1}`,
        chunk_index: indexOffset + i,
        total_siblings: rawChunks.length,
        hash,
        char_count: content.length,
        word_count: content.split(/\s+/).filter(Boolean).length,
        approx_tokens: approxTokens(content),
        keywords: tfKeywords(content),
        density_score: densityScore(content),
        content,
        startOffset,
        endOffset,
      };

      if (sourceMeta?.source) base.source = sourceMeta.source;
      if (sourceMeta?.source_type) base.source_type = sourceMeta.source_type;

      if (sourceMeta?.source_type === 'pdf' && sourceMeta.page_offsets?.length) {
        base.page = pageFromOffset(sourceMeta.page_offsets, startOffset);
      }

      if (sourceMeta?.source_type === 'md' && sourceMeta.section_map) {
        const sec = sourceMeta.section_map[i];
        if (sec) base.section = sec;
      }

      return base;
    })
  );
}
