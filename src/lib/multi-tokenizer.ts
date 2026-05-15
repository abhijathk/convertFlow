/**
 * Multi-tokenizer support: OpenAI tiktoken variants + HuggingFace SentencePiece-based models.
 *
 * Tiktoken variants run synchronously via js-tiktoken.
 * HuggingFace variants are loaded lazily via @huggingface/transformers AutoTokenizer.
 * All loaded tokenizers are cached in module state.
 */

import { env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TiktokenId = 'cl100k_base' | 'o200k_base' | 'p50k_base' | 'r50k_base';
export type HfTokenizerId = 'llama3' | 'mistral' | 'gemma';
export type TokenizerId = TiktokenId | HfTokenizerId;

export interface TokenizeResult {
  tokens: string[];
  ids: number[];
  count: number;
}

type ProgressCallbackFn = (loaded: number, total: number) => void;

// ── Tiktoken ──────────────────────────────────────────────────────────────────

/** Map from our canonical ID to the js-tiktoken encoding name. */
const TIKTOKEN_ENCODING: Record<TiktokenId, string> = {
  cl100k_base: 'cl100k_base',
  o200k_base:  'o200k_base',
  p50k_base:   'p50k_base',
  r50k_base:   'r50k_base',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tiktokenCache = new Map<TiktokenId, any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTiktoken(id: TiktokenId): Promise<any> {
  if (tiktokenCache.has(id)) return tiktokenCache.get(id);
  const encodingName = TIKTOKEN_ENCODING[id];
  const mod = await import('js-tiktoken');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enc = (mod as unknown as Record<string, (...args: unknown[]) => unknown>)
    ['get_encoding'](encodingName);
  tiktokenCache.set(id, enc);
  return enc;
}

async function tokenizeTiktoken(text: string, id: TiktokenId): Promise<TokenizeResult> {
  const enc = await getTiktoken(id);
  const ids: number[] = Array.from(enc.encode(text) as Uint32Array);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const tokens: string[] = ids.map((tid: number) => {
    try {
      const bytes: Uint8Array = enc.decode(new Uint32Array([tid]));
      return decoder.decode(bytes);
    } catch {
      return `<${tid}>`;
    }
  });
  return { tokens, ids, count: ids.length };
}

// ── HuggingFace AutoTokenizer ─────────────────────────────────────────────────

const HF_MODEL_IDS: Record<HfTokenizerId, string> = {
  llama3:  'Xenova/llama-3-tokenizer',
  mistral: 'Xenova/mistral-tokenizer-v3',
  gemma:   'Xenova/gemma-7b-tokenizer',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hfTokenizerCache = new Map<HfTokenizerId, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hfLoadPromises = new Map<HfTokenizerId, Promise<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getHfTokenizer(id: HfTokenizerId, onProgress?: ProgressCallbackFn): Promise<any> {
  if (hfTokenizerCache.has(id)) return hfTokenizerCache.get(id);
  if (hfLoadPromises.has(id)) return hfLoadPromises.get(id)!;

  const modelId = HF_MODEL_IDS[id];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promise: Promise<any> = (async () => {
    const { AutoTokenizer } = await import('@huggingface/transformers');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressCb = (progress: any) => {
      if (!onProgress) return;
      if (
        progress?.status === 'progress' &&
        typeof progress.loaded === 'number' &&
        typeof progress.total === 'number' &&
        progress.total > 0
      ) {
        onProgress(progress.loaded, progress.total);
      }
    };

    const tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      progress_callback: progressCb,
    });

    hfTokenizerCache.set(id, tokenizer);
    hfLoadPromises.delete(id);
    return tokenizer;
  })();

  hfLoadPromises.set(id, promise);
  return promise;
}

async function tokenizeHf(
  text: string,
  id: HfTokenizerId,
  onProgress?: ProgressCallbackFn,
): Promise<TokenizeResult> {
  const tokenizer = await getHfTokenizer(id, onProgress);

  // Call tokenizer as a function — standard transformers.js pattern
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoded: any = tokenizer(text, { add_special_tokens: false });
  // input_ids.data can be BigInt64Array or Int32Array depending on the model
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawIds: any = encoded.input_ids?.data ?? encoded.input_ids ?? [];
  const ids: number[] = Array.from(rawIds as ArrayLike<number | bigint>).map(Number);

  const tokens: string[] = ids.map((tid: number) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decoded: string = (tokenizer as any).decode([tid], { skip_special_tokens: false });
      return decoded;
    } catch {
      return `<${tid}>`;
    }
  });

  return { tokens, ids, count: ids.length };
}

// ── Public API ────────────────────────────────────────────────────────────────

const HF_IDS = new Set<string>(['llama3', 'mistral', 'gemma']);

/**
 * Tokenize `text` with the specified tokenizer.
 * Tiktoken variants are synchronous-in-async wrappers; HF variants may trigger
 * a model download (~2–5 MB) on first use.
 *
 * @param onProgress Optional download-progress callback for HF tokenizers.
 */
export async function tokenize(
  text: string,
  tokenizerId: TokenizerId,
  onProgress?: ProgressCallbackFn,
): Promise<TokenizeResult> {
  if (HF_IDS.has(tokenizerId)) {
    return tokenizeHf(text, tokenizerId as HfTokenizerId, onProgress);
  }
  return tokenizeTiktoken(text, tokenizerId as TiktokenId);
}

/** Reset all cached tokenizers (useful in tests or memory-pressure situations). */
export function resetTokenizerCache(): void {
  tiktokenCache.clear();
  hfTokenizerCache.clear();
  hfLoadPromises.clear();
}
