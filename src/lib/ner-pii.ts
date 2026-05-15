/**
 * Neural NER-based PII detection using Xenova/bert-base-NER.
 * Lazy-loads the model on first call; caches in IndexedDB via transformers.js.
 * Model: ~50 MB q8 quantized.
 */

import {
  pipeline,
  env,
  type TokenClassificationPipeline,
  type ProgressCallback,
} from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const NER_MODEL_ID = 'Xenova/bert-base-NER';

export type NerEntityType = 'PER' | 'ORG' | 'LOC' | 'MISC';

export interface NerEntity {
  entity: string;
  type: NerEntityType;
  start: number;
  end: number;
  score: number;
}

type ProgressCallbackFn = (loaded: number, total: number) => void;

let nerPipelineCache: TokenClassificationPipeline | null = null;
let nerLoadPromise: Promise<TokenClassificationPipeline> | null = null;

export async function getNerPipeline(
  onProgress?: ProgressCallbackFn,
): Promise<TokenClassificationPipeline> {
  if (nerPipelineCache) return nerPipelineCache;
  if (nerLoadPromise) return nerLoadPromise;

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

  nerLoadPromise = (async () => {
    let ner: TokenClassificationPipeline;
    try {
      ner = await pipeline('token-classification', NER_MODEL_ID, {
        dtype: 'q8',
        device: 'webgpu',
        progress_callback: progressCallback,
      }) as TokenClassificationPipeline;
    } catch {
      ner = await pipeline('token-classification', NER_MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: progressCallback,
      }) as TokenClassificationPipeline;
    }
    nerPipelineCache = ner;
    nerLoadPromise = null;
    return ner;
  })();

  return nerLoadPromise;
}

/** Map raw BERT NER labels (B-PER, I-ORG, etc.) to our 4-type taxonomy. */
function normalizeEntityType(label: string): NerEntityType | null {
  const upper = label.toUpperCase();
  if (upper.includes('PER')) return 'PER';
  if (upper.includes('ORG')) return 'ORG';
  if (upper.includes('LOC') || upper.includes('GPE')) return 'LOC';
  if (upper.includes('MISC')) return 'MISC';
  // O (outside) or unknown
  return null;
}

/**
 * Run BERT NER on text, aggregate consecutive B-/I- spans into single entities.
 * Returns entities with character offsets into the original text.
 *
 * @param text   The text to analyze (max ~512 BERT tokens; long text is truncated by the model).
 * @param onProgress Optional download-progress callback.
 */
export async function detectNamedEntities(
  text: string,
  onProgress?: ProgressCallbackFn,
): Promise<NerEntity[]> {
  if (!text.trim()) return [];

  const ner = await getNerPipeline(onProgress);

  // aggregate: true collapses B-/I- spans automatically
  const raw = await ner(text, { aggregation_strategy: 'simple' });

  const rawArr = Array.isArray(raw) ? raw : [raw];

  const results: NerEntity[] = [];

  for (const item of rawArr) {
    if (typeof item !== 'object' || item === null) continue;

    const label =
      ('entity_group' in item && typeof item.entity_group === 'string')
        ? item.entity_group
        : ('entity' in item && typeof item.entity === 'string')
          ? item.entity
          : '';

    const score =
      'score' in item && typeof item.score === 'number' ? item.score : 0;

    const start =
      'start' in item && typeof item.start === 'number' ? item.start : -1;

    const end =
      'end' in item && typeof item.end === 'number' ? item.end : -1;

    const word =
      'word' in item && typeof item.word === 'string'
        ? item.word
        : start >= 0 && end >= 0
          ? text.slice(start, end)
          : '';

    if (!label || start < 0 || end < 0 || !word) continue;

    const type = normalizeEntityType(label);
    if (!type) continue;

    results.push({ entity: word, type, start, end, score });
  }

  return results;
}

/** Reset cached NER pipeline (useful in tests or memory-pressure situations). */
export function resetNerPipelineCache(): void {
  nerPipelineCache = null;
  nerLoadPromise = null;
}
