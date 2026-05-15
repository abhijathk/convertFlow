import { chunkText } from '../lib/chunk';
import { enrichChunks } from '../lib/rag-metadata';
import type { SourceMeta } from '../lib/rag-metadata';
import type { ChunkStrategy } from '../stores/chunkState';
import type { ChunkParams } from '../lib/chunk';

export interface ChunkRequest {
  type: 'chunk';
  text: string;
  strategy: ChunkStrategy;
  params?: ChunkParams;
  source?: string;
  source_type?: SourceMeta['source_type'];
  page_offsets?: number[];   // char-offset at which each PDF page begins
  index_offset?: number;     // chunk_index offset when batching multiple files
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
  const { text, strategy, params, source, source_type, page_offsets, index_offset } = e.data;
  try {
    const raw = chunkText(text, strategy, params);

    // Build section_map for markdown: for each raw chunk find the most-recent
    // heading that precedes its startOffset in the source text.
    let section_map: string[] | undefined;
    if (source_type === 'md') {
      // Collect all heading positions from the source text
      const headings: { offset: number; text: string }[] = [];
      const headingRe = /^(#{1,6})\s+(.+)$/gm;
      let m: RegExpExecArray | null;
      while ((m = headingRe.exec(text)) !== null) {
        headings.push({ offset: m.index, text: m[2].trim() });
      }
      section_map = raw.map(chunk => {
        // Walk headings in reverse to find the last one before this chunk start
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

    const chunks = await enrichChunks(raw, sourceMeta, index_offset ?? 0);
    const response: ChunkResult = { type: 'result', chunks };
    self.postMessage(response);
  } catch (err) {
    const response: ChunkError = { type: 'error', message: String(err) };
    self.postMessage(response);
  }
};
