import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import type { TokenizerId } from '../../multi-tokenizer';

export interface TokenizerToken {
  id: number;
  text: string;
}

export interface PerTokenizerResult {
  count: number;
  tokens: TokenizerToken[];
}

export interface TokenizerInspectorResult {
  perTokenizer: Partial<Record<TokenizerId, PerTokenizerResult>>;
}

const ALL_TOKENIZERS: TokenizerId[] = [
  'cl100k_base',
  'o200k_base',
  'p50k_base',
  'r50k_base',
  'llama3',
  'mistral',
  'gemma',
];

const tokenizerInspector: UtilityToolModule = {
  id: 'tokenizer-inspector',
  name: 'Tokenizer Inspector',
  category: 'llm',
  async run(payload: UtilityPayload): Promise<UtilityResult> {
    const text = payload.input;
    if (!text.trim()) return { ok: false, error: 'Input is empty.' };

    const enabled = (payload.options?.enabled as TokenizerId[] | undefined) ?? ['cl100k_base', 'o200k_base'];
    const onProgress = payload.options?.onProgress as
      | ((tokenizerId: TokenizerId, loaded: number, total: number) => void)
      | undefined;

    const { tokenize } = await import('../../multi-tokenizer');

    const perTokenizer: Partial<Record<TokenizerId, PerTokenizerResult>> = {};

    for (const id of ALL_TOKENIZERS) {
      if (!enabled.includes(id)) continue;
      try {
        const progressFn = onProgress
          ? (loaded: number, total: number) => onProgress(id, loaded, total)
          : undefined;

        const result = await tokenize(text, id, progressFn);
        perTokenizer[id] = {
          count: result.count,
          tokens: result.ids.map((tid, i) => ({ id: tid, text: result.tokens[i] ?? '' })),
        };
      } catch (e) {
        perTokenizer[id] = {
          count: -1,
          tokens: [],
        };
        // Surface per-tokenizer errors as a count of -1; the view handles rendering
        void e;
      }
    }

    const data: TokenizerInspectorResult = { perTokenizer };
    return { ok: true, data };
  },
};

export default tokenizerInspector;
