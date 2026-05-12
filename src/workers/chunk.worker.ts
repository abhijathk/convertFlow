import { chunkText } from '../lib/chunk';
import { enrichChunks } from '../lib/rag-metadata';
import type { ChunkStrategy } from '../stores/chunkState';
import type { ChunkParams } from '../lib/chunk';

export interface ChunkRequest {
  type: 'chunk';
  text: string;
  strategy: ChunkStrategy;
  params?: ChunkParams;
}

export interface ChunkResult {
  type: 'result';
  chunks: Awaited<ReturnType<typeof enrichChunks>>;
}

export interface ChunkError {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<ChunkRequest>) => {
  const { text, strategy, params } = e.data;
  try {
    const raw = chunkText(text, strategy, params);
    const chunks = await enrichChunks(raw);
    const response: ChunkResult = { type: 'result', chunks };
    self.postMessage(response);
  } catch (err) {
    const response: ChunkError = { type: 'error', message: String(err) };
    self.postMessage(response);
  }
};
