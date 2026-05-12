import LZString from 'lz-string';

export interface ConvertSharePayload {
  tab: 'convert';
  presetId: string;
  lines: string[];
}

export interface ChunkSharePayload {
  tab: 'chunk';
  strategy: string;
  embedderId: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface EditorSharePayload {
  tab: 'editor';
  name: string;
  content: string;
}

export type SharePayload = ConvertSharePayload | ChunkSharePayload | EditorSharePayload;

const MAX_LINES = 50;
const MAX_URL_LENGTH = 2000;

export function encodeConvertShare(presetId: string, content: string): string {
  const lines = content
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, MAX_LINES);

  const payload: ConvertSharePayload = { tab: 'convert', presetId, lines };
  const json = JSON.stringify(payload);
  const compressed = LZString.compressToEncodedURIComponent(json);
  const fragment = `t=convert&s=${compressed}`;

  if (fragment.length > MAX_URL_LENGTH) {
    // Truncate to fewer lines until it fits
    for (let n = MAX_LINES - 1; n > 0; n--) {
      const truncated: ConvertSharePayload = { tab: 'convert', presetId, lines: lines.slice(0, n) };
      const c2 = LZString.compressToEncodedURIComponent(JSON.stringify(truncated));
      if (`t=convert&s=${c2}`.length <= MAX_URL_LENGTH) {
        return c2;
      }
    }
  }

  return compressed;
}

export function encodeChunkShare(
  strategy: string,
  embedderId: string,
  chunkSize: number,
  chunkOverlap: number,
): string {
  const payload: ChunkSharePayload = { tab: 'chunk', strategy, embedderId, chunkSize, chunkOverlap };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

const MAX_CONTENT_CHARS = 40000;

export function encodeEditorShare(name: string, content: string): string {
  const truncated = content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;
  const payload: EditorSharePayload = { tab: 'editor', name, content: truncated };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeShareFragment(hash: string): SharePayload | null {
  try {
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const s = params.get('s');
    if (!s) return null;
    const json = LZString.decompressFromEncodedURIComponent(s);
    if (!json) return null;
    return JSON.parse(json) as SharePayload;
  } catch {
    return null;
  }
}
