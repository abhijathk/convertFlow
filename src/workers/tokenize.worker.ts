import type { TokenizeMessage, TokenizeResponse } from '../lib/tokenize';

const TIKTOKEN_ENCODINGS = new Set(['cl100k_base', 'o200k_base', 'p50k_base', 'r50k_base']);

self.onmessage = async (e: MessageEvent<TokenizeMessage>) => {
  const msg = e.data;

  if (msg.type === 'approximate') {
    const tokens = Math.ceil(msg.text.length / 4);
    const response: TokenizeResponse = { type: 'result', tokens, exact: false };
    self.postMessage(response);
    return;
  }

  if (msg.type === 'exact') {
    const encoding = msg.encoding;

    if (encoding && TIKTOKEN_ENCODINGS.has(encoding)) {
      try {
        const { Tiktoken } = await import('js-tiktoken/lite');

        let rankData: { bpe_ranks: string; special_tokens: Record<string, number>; pat_str: string };
        if (encoding === 'cl100k_base') {
          rankData = (await import('js-tiktoken/ranks/cl100k_base')).default;
        } else if (encoding === 'o200k_base') {
          rankData = (await import('js-tiktoken/ranks/o200k_base')).default;
        } else if (encoding === 'p50k_base') {
          rankData = (await import('js-tiktoken/ranks/p50k_base')).default;
        } else {
          rankData = (await import('js-tiktoken/ranks/r50k_base')).default;
        }

        const enc = new Tiktoken(rankData);
        const tokens = enc.encode(msg.text).length;
        const response: TokenizeResponse = { type: 'result', tokens, exact: true };
        self.postMessage(response);
        return;
      } catch {
        // fall through to approximate
      }
    }

    // Fallback: approximate (used for Claude, Llama, Mistral, etc.)
    const tokens = Math.ceil(msg.text.length / 4);
    const response: TokenizeResponse = { type: 'result', tokens, exact: false };
    self.postMessage(response);
  }
};
