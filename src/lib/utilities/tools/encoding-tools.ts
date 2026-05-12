import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export type EncodingMode =
  | 'base64-encode'
  | 'base64-decode'
  | 'url-encode'
  | 'url-decode'
  | 'url-component-encode'
  | 'url-component-decode'
  | 'hex-encode'
  | 'hex-decode';

export interface EncodingResult {
  output: string;
  mode: EncodingMode;
}

function base64Encode(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

function base64Decode(input: string): string {
  return decodeURIComponent(escape(atob(input.trim())));
}

const encodingTools: UtilityToolModule = {
  id: 'encoding-tools',
  name: 'Base64 / URL Encode-Decode',
  category: 'encoding',
  run(payload: UtilityPayload): UtilityResult {
    const input = payload.input;
    const mode = ((payload.options?.mode as EncodingMode) ?? 'base64-encode');

    try {
      let output: string;
      switch (mode) {
        case 'base64-encode':
          output = base64Encode(input);
          break;
        case 'base64-decode':
          output = base64Decode(input);
          break;
        case 'url-encode':
          output = encodeURI(input);
          break;
        case 'url-decode':
          output = decodeURI(input);
          break;
        case 'url-component-encode':
          output = encodeURIComponent(input);
          break;
        case 'url-component-decode':
          output = decodeURIComponent(input);
          break;
        case 'hex-encode': {
          const bytes = new TextEncoder().encode(input);
          output = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
          break;
        }
        case 'hex-decode': {
          const pairs = input.trim().match(/.{2}/g) ?? [];
          const decoded = new Uint8Array(pairs.map(b => parseInt(b, 16)));
          output = new TextDecoder().decode(decoded);
          break;
        }
        default:
          output = input;
      }
      return { ok: true, data: { output, mode } as EncodingResult };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Encoding/decoding failed.' };
    }
  },
};

export default encodingTools;
