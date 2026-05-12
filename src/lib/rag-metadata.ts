import type { ChunkMeta } from '../stores/chunkState';
import type { RawChunk } from './chunk';

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

export async function enrichChunks(rawChunks: RawChunk[]): Promise<ChunkMeta[]> {
  return Promise.all(
    rawChunks.map(async ({ text: content, startOffset, endOffset }, i) => {
      const hash = await hashText(content);
      return {
        chunk_id: `chunk-${i + 1}`,
        chunk_index: i,
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
    })
  );
}
