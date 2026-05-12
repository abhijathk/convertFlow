import type { Preset } from './validate';
import embeddersJson from '../data/embedders.json';

export function calculateTrainingCost(tokens: number, preset: Preset): number {
  return (tokens / 1_000_000) * preset.pricing.trainingPerMTokens;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return '< $0.01';
  if (cost < 10) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(0)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

// ── Embedding cost ────────────────────────────────────────────────────────────

export function embeddingPricePerMToken(embedderId: string): number {
  const entry = embeddersJson.find(e => e.id === embedderId);
  return entry?.pricePerMTokens ?? 0;
}

export function formatEmbeddingCost(tokens: number, embedderId: string): string {
  const pricePerM = embeddingPricePerMToken(embedderId);
  if (pricePerM === 0) return '$0.00';
  const cost = (tokens / 1_000_000) * pricePerM;
  if (cost < 0.01) return '< $0.01';
  if (cost < 10) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(0)}`;
}
