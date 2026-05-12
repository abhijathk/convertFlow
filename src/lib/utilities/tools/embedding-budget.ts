import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import { approximateTokens } from '../../tokenize';
import embeddersJson from '../../../data/embedders.json';

export interface EmbedderCostRow {
  id: string;
  name: string;
  provider: string;
  pricePerMTokens: number;
  cost: number;
}

export interface EmbeddingBudgetResult {
  totalChars: number;
  totalTokens: number;
  numChunks: number;
  selectedEmbedderId: string;
  selectedCost: number;
  comparison: EmbedderCostRow[];
}

const embeddingBudget: UtilityToolModule = {
  id: 'embedding-budget',
  name: 'Embedding Budget Estimator',
  category: 'llm',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input;
    if (!text.trim()) return { ok: false, error: 'Input is empty.' };

    const opts = payload.options ?? {};
    const chunkSize = Math.max(1, Number(opts['chunkSize']) || 512);
    const selectedEmbedderId = (opts['embedderId'] as string) ?? 'openai-text-embedding-3-small';

    const totalChars = text.length;
    const totalTokens = approximateTokens(text);
    const numChunks = Math.ceil(totalTokens / chunkSize);

    const comparison: EmbedderCostRow[] = embeddersJson.map(e => ({
      id: e.id,
      name: e.name,
      provider: e.provider,
      pricePerMTokens: e.pricePerMTokens,
      cost: (totalTokens / 1_000_000) * e.pricePerMTokens,
    }));

    const selectedRow = comparison.find(r => r.id === selectedEmbedderId);
    const selectedCost = selectedRow?.cost ?? 0;

    const data: EmbeddingBudgetResult = {
      totalChars,
      totalTokens,
      numChunks,
      selectedEmbedderId,
      selectedCost,
      comparison,
    };
    return { ok: true, data };
  },
};

export default embeddingBudget;
