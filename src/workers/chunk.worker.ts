import { chunkText, embeddingChunk, lateChunkEmbeddings } from '../lib/chunk';
import { enrichChunks } from '../lib/rag-metadata';
import type { SourceMeta } from '../lib/rag-metadata';
import type { ChunkStrategy } from '../stores/chunkState';
import type { ChunkParams } from '../lib/chunk';
import type { ChunkMeta } from '../stores/chunkState';

export interface ChunkRequest {
  type: 'chunk';
  text: string;
  strategy: ChunkStrategy;
  params?: ChunkParams;
  source?: string;
  source_type?: SourceMeta['source_type'];
  page_offsets?: number[];   // char-offset at which each PDF page begins
  index_offset?: number;     // chunk_index offset when batching multiple files
  lateChunking?: boolean;    // Feature #2: compute late-chunking embeddings
}

export interface ChunkResult {
  type: 'result';
  chunks: ChunkMeta[];
}

export interface ChunkError {
  type: 'error';
  message: string;
}

export interface EmbeddingProgress {
  type: 'embedding-progress';
  loaded: number;
  total: number;
}

type WorkerMessage = ChunkResult | ChunkError | EmbeddingProgress;

function postProgress(loaded: number, total: number) {
  const msg: EmbeddingProgress = { type: 'embedding-progress', loaded, total };
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<ChunkRequest>) => {
  const {
    text,
    strategy,
    params,
    source,
    source_type,
    page_offsets,
    index_offset,
    lateChunking,
  } = e.data;

  try {
    // ── Step 1: raw chunking ─────────────────────────────────────────────────
    let raw: import('../lib/chunk').RawChunk[];

    if (strategy === 'embedding') {
      raw = await embeddingChunk(text, params, postProgress);
    } else {
      raw = chunkText(text, strategy, params);
    }

    // ── Step 2: section map for markdown ────────────────────────────────────
    let section_map: string[] | undefined;
    if (source_type === 'md') {
      const headings: { offset: number; text: string }[] = [];
      const headingRe = /^(#{1,6})\s+(.+)$/gm;
      let m: RegExpExecArray | null;
      while ((m = headingRe.exec(text)) !== null) {
        headings.push({ offset: m.index, text: m[2].trim() });
      }
      section_map = raw.map(chunk => {
        for (let i = headings.length - 1; i >= 0; i--) {
          if (headings[i].offset <= chunk.startOffset) {
            return headings[i].text;
          }
        }
        return '';
      });
    }

    const sourceMeta: SourceMeta = {
      source,
      source_type,
      page_offsets,
      section_map,
    };

    // ── Step 3: embeddings (late-chunking or embedding strategy) ─────────────
    let chunkEmbeddings: { embeddings: Float32Array[]; lateChunked: boolean } | undefined;

    if (lateChunking || strategy === 'embedding') {
      // For the embedding strategy, we already have sentence-level embeddings
      // from embeddingChunk. We still run late-chunk pooling over the whole
      // document to produce proper chunk-level embeddings with cross-chunk context.
      // For late-chunking mode on other strategies, run full late-chunk embeddings.
      const result = await lateChunkEmbeddings(text, raw, postProgress);
      chunkEmbeddings = result as { embeddings: Float32Array[]; lateChunked: boolean };
    }

    // ── Step 4: enrich chunks ────────────────────────────────────────────────
    const chunks = await enrichChunks(raw, sourceMeta, index_offset ?? 0, chunkEmbeddings);
    const response: ChunkResult = { type: 'result', chunks };
    self.postMessage(response);
  } catch (err) {
    const response: ChunkError = { type: 'error', message: String(err) };
    self.postMessage(response);
  }
};
