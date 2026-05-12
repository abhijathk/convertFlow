import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import { approximateTokens } from '../../tokenize';

export type TokenStatus = 'ok' | 'warning' | 'over';

export interface TokenRow {
  line: number;
  tokens: number;
  status: TokenStatus;
}

export interface TokenAnalyzerResult {
  rows: TokenRow[];
  summary: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    totalOver: number;
    totalWarning: number;
  };
}

const TOKEN_ANALYZER_CONTEXT_SIZES: Record<string, number> = {
  '8k': 8192,
  '16k': 16384,
  '32k': 32768,
  '128k': 131072,
  '200k': 200000,
  '1M': 1048576,
};

const tokenAnalyzer: UtilityToolModule = {
  id: 'token-analyzer',
  name: 'Token-per-row Analyzer',
  category: 'llm',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input.trim();
    if (!text) return { ok: false, error: 'Input is empty.' };

    const opts = payload.options ?? {};
    const customWindow = typeof opts['customWindow'] === 'number' ? (opts['customWindow'] as number) : 0;
    const windowKey = (opts['contextWindow'] as string) ?? '128k';
    const limit = customWindow > 0 ? customWindow : (TOKEN_ANALYZER_CONTEXT_SIZES[windowKey] ?? 131072);

    const lines = text.split('\n').filter(l => l.trim() !== '');

    const rows: TokenRow[] = lines.map((line, i) => {
      const tokens = approximateTokens(line);
      let status: TokenStatus = 'ok';
      if (tokens >= limit) status = 'over';
      else if (tokens >= limit * 0.8) status = 'warning';
      return { line: i + 1, tokens, status };
    });

    const tokenCounts = rows.map(r => r.tokens);
    const sorted = [...tokenCounts].sort((a, b) => a - b);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const avg = tokenCounts.length > 0 ? Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length) : 0;
    const p95Idx = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Idx] ?? max;
    const totalOver = rows.filter(r => r.status === 'over').length;
    const totalWarning = rows.filter(r => r.status === 'warning').length;

    const data: TokenAnalyzerResult = {
      rows,
      summary: { min, max, avg, p95, totalOver, totalWarning },
    };
    return { ok: true, data };
  },
};

export default tokenAnalyzer;
