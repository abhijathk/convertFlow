export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function approximateTokensPerLine(lines: string[]): number[] {
  return lines.map((l) => Math.ceil(l.length / 4));
}

export type TokenizeMessage =
  | { type: 'approximate'; text: string }
  | { type: 'exact'; text: string; encoding: string | null };

export type TokenizeResponse =
  | { type: 'result'; tokens: number; exact: boolean }
  | { type: 'error'; message: string };
