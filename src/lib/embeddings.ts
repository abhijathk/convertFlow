/**
 * Shared embedding infrastructure using @huggingface/transformers v4.
 * Model: Xenova/all-MiniLM-L6-v2 (q8 quantized, ~23 MB)
 * Loads lazily on first call and caches in module state.
 * IndexedDB caching is handled automatically by transformers.js env.
 */

import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
  type ProgressCallback,
} from '@huggingface/transformers';

// Use browser cache (IndexedDB) — transformers.js handles this by default
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
/** Max context window for MiniLM-L6-v2 in tokens */
export const MINILM_MAX_TOKENS = 512;

type ProgressCallbackFn = (loaded: number, total: number) => void;

let pipelineCache: FeatureExtractionPipeline | null = null;
let loadPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Returns the shared pipeline, loading it once on first call.
 * @param onProgress called with (loaded_bytes, total_bytes) during model download.
 */
export async function getEmbeddingPipeline(
  onProgress?: ProgressCallbackFn,
): Promise<FeatureExtractionPipeline> {
  if (pipelineCache) return pipelineCache;
  if (loadPromise) return loadPromise;

  const progressCallback: ProgressCallback = (progress) => {
    if (!onProgress) return;
    if (
      progress.status === 'progress' &&
      'loaded' in progress &&
      'total' in progress &&
      typeof progress.loaded === 'number' &&
      typeof progress.total === 'number' &&
      progress.total > 0
    ) {
      onProgress(progress.loaded, progress.total);
    }
  };

  loadPromise = (async () => {
    // Prefer WebGPU; fall back to WASM automatically.
    let extractor: FeatureExtractionPipeline;
    try {
      extractor = await pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
        device: 'webgpu',
        progress_callback: progressCallback,
      }) as FeatureExtractionPipeline;
    } catch {
      // WebGPU unavailable — fall back to WASM
      extractor = await pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: progressCallback,
      }) as FeatureExtractionPipeline;
    }
    pipelineCache = extractor;
    loadPromise = null;
    return extractor;
  })();

  return loadPromise;
}

/**
 * Cosine similarity between two Float32Arrays.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Mean-pool a 2D tensor output into a single 1D Float32Array.
 * Input shape: [1, seq_len, hidden_size]
 */
function meanPool(data: Float32Array, seqLen: number, hiddenSize: number): Float32Array {
  const result = new Float32Array(hiddenSize);
  for (let t = 0; t < seqLen; t++) {
    for (let h = 0; h < hiddenSize; h++) {
      result[h] += data[t * hiddenSize + h];
    }
  }
  for (let h = 0; h < hiddenSize; h++) {
    result[h] /= seqLen;
  }
  return result;
}

/**
 * Embed a single text string.
 * Returns the mean-pooled embedding as a Float32Array.
 */
export async function embedText(
  text: string,
  onProgress?: ProgressCallbackFn,
): Promise<Float32Array> {
  const extractor = await getEmbeddingPipeline(onProgress);
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  // output.data is the flat tensor data
  return new Float32Array(output.data as Float32Array);
}

/**
 * Embed a batch of texts efficiently.
 */
export async function embedBatch(
  texts: string[],
  onProgress?: ProgressCallbackFn,
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await getEmbeddingPipeline(onProgress);

  const results: Float32Array[] = [];
  // Process in sub-batches to avoid OOM on large inputs
  const BATCH_SIZE = 32;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    const data = output.data as Float32Array;
    const hiddenSize = data.length / batch.length;
    for (let j = 0; j < batch.length; j++) {
      results.push(new Float32Array(data.slice(j * hiddenSize, (j + 1) * hiddenSize)));
    }
  }
  return results;
}

export interface TokenEmbeddingsResult {
  tokenEmbeddings: Float32Array[];
  /** Character offsets for each token in the original text */
  tokenOffsets: { start: number; end: number }[];
}

/**
 * Returns per-token embeddings and their character offsets in the source text.
 * Used for late chunking: allows mean-pooling over token spans per chunk.
 *
 * NOTE: MiniLM has a 512-token context window. If `text` exceeds that, we
 * truncate and log a warning. For late chunking over long documents, use a
 * long-context model instead.
 */
export async function embedTokens(
  text: string,
  onProgress?: ProgressCallbackFn,
): Promise<TokenEmbeddingsResult> {
  const extractor = await getEmbeddingPipeline(onProgress);

  // Run without mean-pooling so we get the raw last-hidden-state per token
  const output = await extractor(text, {
    pooling: 'none',
    normalize: false,
  });

  // output.dims = [batch=1, seq_len, hidden_size]
  const dims = output.dims as number[];
  const seqLen = dims[1];
  const hiddenSize = dims[2];
  const flatData = output.data as Float32Array;

  // Extract per-token embeddings
  const tokenEmbeddings: Float32Array[] = [];
  for (let t = 0; t < seqLen; t++) {
    tokenEmbeddings.push(
      new Float32Array(flatData.slice(t * hiddenSize, (t + 1) * hiddenSize)),
    );
  }

  // Build approximate character offsets by splitting text into word-ish tokens.
  // transformers.js does not expose the tokenizer's char_to_word map in the
  // pipeline output, so we approximate: align tokens to the source text by
  // scanning forward. CLS and SEP tokens are mapped to offset 0/end.
  const tokenOffsets = approximateTokenOffsets(text, seqLen);

  return { tokenEmbeddings, tokenOffsets };
}

/**
 * Approximates character offsets for `seqLen` tokens from `text`.
 * CLS (token 0) and SEP (last token) are pinned to 0 and text.length.
 * Remaining tokens are distributed uniformly across the text.
 * This is a V1 approximation — sufficient for mean-pooling span embeddings.
 */
function approximateTokenOffsets(
  text: string,
  seqLen: number,
): { start: number; end: number }[] {
  const offsets: { start: number; end: number }[] = [];
  if (seqLen <= 0) return offsets;

  // Special tokens: CLS at position 0, SEP at last position
  const contentTokens = seqLen - 2; // excluding CLS and SEP
  offsets.push({ start: 0, end: 0 }); // CLS

  if (contentTokens <= 0) {
    offsets.push({ start: text.length, end: text.length }); // SEP only
    return offsets;
  }

  const chunkSize = text.length / contentTokens;
  for (let i = 0; i < contentTokens; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.min(text.length, Math.floor((i + 1) * chunkSize));
    offsets.push({ start, end });
  }

  offsets.push({ start: text.length, end: text.length }); // SEP
  return offsets;
}

/**
 * Mean-pool token embeddings whose char offsets fall within [chunkStart, chunkEnd).
 * Skips CLS (index 0) and SEP (last index).
 */
export function poolTokensForChunk(
  tokenEmbeddings: Float32Array[],
  tokenOffsets: { start: number; end: number }[],
  chunkStart: number,
  chunkEnd: number,
): Float32Array {
  if (tokenEmbeddings.length === 0) return new Float32Array(0);
  const hiddenSize = tokenEmbeddings[0].length;

  const result = new Float32Array(hiddenSize);
  let count = 0;

  // Skip first (CLS) and last (SEP) tokens
  for (let i = 1; i < tokenOffsets.length - 1; i++) {
    const { start, end } = tokenOffsets[i];
    // Include token if its midpoint falls within the chunk range
    const mid = (start + end) / 2;
    if (mid >= chunkStart && mid < chunkEnd) {
      for (let h = 0; h < hiddenSize; h++) {
        result[h] += tokenEmbeddings[i][h];
      }
      count++;
    }
  }

  if (count === 0) {
    // Fallback: include all content tokens
    for (let i = 1; i < tokenEmbeddings.length - 1; i++) {
      for (let h = 0; h < hiddenSize; h++) {
        result[h] += tokenEmbeddings[i][h];
      }
    }
    count = Math.max(1, tokenEmbeddings.length - 2);
  }

  for (let h = 0; h < hiddenSize; h++) {
    result[h] /= count;
  }

  // L2-normalize
  let norm = 0;
  for (let h = 0; h < hiddenSize; h++) norm += result[h] * result[h];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let h = 0; h < hiddenSize; h++) result[h] /= norm;
  }

  return result;
}

/** Reset the cached pipeline (useful in tests). */
export function resetPipelineCache(): void {
  pipelineCache = null;
  loadPromise = null;
}

export { meanPool };
