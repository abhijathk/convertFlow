import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export type HashAlgorithm = 'SHA-256' | 'SHA-1' | 'SHA-512';

export interface HashResult {
  hex: string;
  algorithm: HashAlgorithm;
  length: number;
}

async function digest(algorithm: HashAlgorithm, input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const hashTools: UtilityToolModule = {
  id: 'hash-tools',
  name: 'Hash Generator',
  category: 'utility',
  async run(payload: UtilityPayload): Promise<UtilityResult> {
    const input = payload.input;
    const algorithm = ((payload.options?.algorithm as HashAlgorithm) ?? 'SHA-256');

    if (input === '') {
      return { ok: false, error: 'Input is empty.' };
    }

    try {
      const hex = await digest(algorithm, input);
      const data: HashResult = { hex, algorithm, length: hex.length };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Hash failed.' };
    }
  },
};

export default hashTools;
