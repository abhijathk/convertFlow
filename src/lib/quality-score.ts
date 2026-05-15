/**
 * DEITA-style quality scoring: complexity × quality × diversity per row.
 * Reference: Liu et al., DEITA, ICLR 2024 (2312.15685)
 *
 * Embedding calls re-use the shared getEmbeddingPipeline() from embeddings.ts.
 * All computation is done on the main thread with setTimeout yields between rows.
 */

import { embedBatch, cosineSimilarity } from './embeddings';

// ── Complexity ────────────────────────────────────────────────────────────────

/**
 * Shannon entropy (bits) of an array of values.
 * Returns 0 for empty or uniform arrays.
 */
function shannonEntropy(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const v of values) {
    if (v === 0) continue;
    const p = v / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Byte-pair entropy: count 2-gram character pairs, compute Shannon entropy.
 * Serves as a proxy for token-id distribution entropy.
 */
function bpEntropy(text: string): number {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const bp = text.slice(i, i + 2);
    counts.set(bp, (counts.get(bp) ?? 0) + 1);
  }
  return shannonEntropy([...counts.values()]);
}

/**
 * Count `"role":` occurrences as a proxy for turn depth.
 * Handles both `"role":` and `"role" :` formatting.
 */
function turnCount(row: string): number {
  const m = row.match(/"role"\s*:/g);
  return m ? m.length : 0;
}

const MAX_ROW_LENGTH = 32768;

/**
 * Heuristic complexity score ∈ [0, 1].
 * Combines: row length (log-normalized), byte-pair entropy, and turn count.
 */
export function complexityScore(row: string): number {
  const text = row.slice(0, MAX_ROW_LENGTH);
  const lengthScore = Math.min(1, Math.log1p(text.length) / Math.log1p(MAX_ROW_LENGTH));
  const entropyScore = Math.min(1, bpEntropy(text) / 16);
  const turns = turnCount(text);
  const turnScore = Math.min(1, Math.log1p(turns) / Math.log1p(20));
  return (lengthScore * 0.4 + entropyScore * 0.4 + turnScore * 0.2);
}

// ── Quality ───────────────────────────────────────────────────────────────────

/** Simple hash for caching quality scores by row content. */
function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < Math.min(s.length, 2048); i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h.toString(36);
}

const qualityCache = new Map<string, number>();

/**
 * Quality score ∈ [0, 1].
 *
 * Uses a deterministic heuristic proxy (no model required):
 *   quality = 1 − (repetition_ratio × 0.6 + control_char_ratio × 0.4)
 *
 * Repetition ratio: fraction of bigram character pairs that are repeats.
 * Control char ratio: fraction of chars that are ASCII control chars (except \n\t).
 *
 * Higher = better quality (less repetitive, fewer control chars).
 */
export async function qualityScore(row: string): Promise<number> {
  const key = quickHash(row);
  if (qualityCache.has(key)) return qualityCache.get(key)!;

  const text = row.slice(0, MAX_ROW_LENGTH);

  // Repetition ratio: bigram repeats / (total - 1)
  let repeatedBigrams = 0;
  const bigramsSeen = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    const bg = text.slice(i, i + 2);
    if (bigramsSeen.has(bg)) repeatedBigrams++;
    else bigramsSeen.add(bg);
  }
  const repetitionRatio = text.length > 1 ? repeatedBigrams / (text.length - 1) : 0;

  // Control char ratio (exclude \n=10, \t=9, \r=13)
  let controlChars = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) controlChars++;
  }
  const controlRatio = text.length > 0 ? controlChars / text.length : 0;

  const score = Math.max(0, Math.min(1, 1 - (repetitionRatio * 0.6 + controlRatio * 0.4)));
  qualityCache.set(key, score);
  return score;
}

/** Clear the quality score cache (e.g. when dataset changes). */
export function clearQualityCache(): void {
  qualityCache.clear();
}

// ── Diversity ─────────────────────────────────────────────────────────────────

/**
 * Diversity scores ∈ [0, 1] per row.
 *
 * Strategy: for each row, compute the minimum cosine similarity to all other
 * rows. Higher minimum distance = more diverse.
 *
 * Uses farthest-point sampling intuition: a point that is far from all others
 * contributes maximum diversity.
 *
 * For large datasets this is O(n²) — callers should only pass ≤5k embeddings.
 */
export function diversityScore(allRowEmbeddings: Float32Array[]): number[] {
  const n = allRowEmbeddings.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  // Pairwise max-similarity: sim[i] = max over j≠i of cosine(i,j)
  const maxSim = new Float32Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = Math.max(0, cosineSimilarity(allRowEmbeddings[i], allRowEmbeddings[j]));
      if (sim > maxSim[i]) maxSim[i] = sim;
      if (sim > maxSim[j]) maxSim[j] = sim;
    }
  }

  // Diversity = 1 − max_similarity (higher = more novel)
  return Array.from(maxSim).map(s => Math.max(0, 1 - s));
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export interface DeitaScoreRow {
  complexity: number;
  quality: number;
  diversity: number;
  combined: number;
}

type ProgressFn = (done: number, total: number) => void;

const YIELD_EVERY = 50; // rows between setTimeout yields

/**
 * Compute DEITA scores for all rows.
 * combined = complexity × quality × diversity
 *
 * @param rows         Raw row strings (JSONL lines or plain text).
 * @param onProgress   Optional progress callback (rows computed so far, total).
 * @param signal       Optional AbortSignal to cancel mid-run.
 */
export async function computeDeitaScores(
  rows: string[],
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<DeitaScoreRow[]> {
  const n = rows.length;
  if (n === 0) return [];

  // Step 1: complexity (sync, fast)
  const complexities = rows.map(complexityScore);

  // Step 2: quality (async, cached, yields periodically)
  const qualities: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    qualities[i] = await qualityScore(rows[i]);
    if (i % YIELD_EVERY === YIELD_EVERY - 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      onProgress?.(i + 1, n * 3); // quality pass = 1/3 of total work
    }
  }
  onProgress?.(n, n * 3);

  // Step 3: embeddings for diversity
  let diversities: number[];
  try {
    const embeddings = await embedBatch(rows, (loaded, total) => {
      // Map embedding download progress into the second third of progress
      const fraction = total > 0 ? loaded / total : 0;
      onProgress?.(Math.round(n + fraction * n), n * 3);
    });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    diversities = diversityScore(embeddings);
    onProgress?.(n * 2, n * 3);
  } catch {
    // If embeddings fail (no network, model download fails) fall back to 1.0
    diversities = new Array(n).fill(1);
  }

  // Step 4: combined score + final yield pass
  const results: DeitaScoreRow[] = [];
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const c = complexities[i];
    const q = qualities[i];
    const d = diversities[i];
    results.push({ complexity: c, quality: q, diversity: d, combined: c * q * d });
    if (i % YIELD_EVERY === YIELD_EVERY - 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      onProgress?.(n * 2 + i + 1, n * 3);
    }
  }
  onProgress?.(n * 3, n * 3);

  return results;
}
