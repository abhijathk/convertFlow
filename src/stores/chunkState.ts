import { writable } from 'svelte/store';

export type ChunkStrategy = 'fixed' | 'paragraph' | 'semantic';
export type ParseStatus = 'idle' | 'uploading' | 'parsing' | 'done' | 'error';

export interface ChunkMeta {
  chunk_id: string;
  chunk_index: number;
  total_siblings: number;
  hash: string;
  char_count: number;
  word_count: number;
  approx_tokens: number;
  keywords: string[];
  density_score: number;
  content: string;
  startOffset: number;
  endOffset: number;
  image_data?: string;       // base64 data URL (data:image/png;base64,...)
  image_filename?: string;
}

export interface ChunkState {
  strategy: ChunkStrategy;
  embedderId: string;
  chunks: ChunkMeta[];
  parseStatus: ParseStatus;
  parseError: string | null;
  parseProgress: number;
  sourceCharCount: number;
  sourceText: string;
  // Populated when source is an image (cleared on clearAll). generate() reads
  // these and produces an image chunk instead of running the text chunker.
  sourceImageData: string;
  sourceImageFilename: string;
  docMetadata: { pages?: number; format?: string; sizeBytes?: number } | null;
  userMeta: { doc_id: string; category: string; tags: string; author: string; language: string };
  chunkSize: number;
  chunkOverlap: number;
  maxKeywords: number;
  enableImages: boolean;
  enableOcr: boolean;
  manualBoundaries: number[] | null;
}

export const chunkState = writable<ChunkState>({
  strategy: 'semantic',
  embedderId: 'openai-text-embedding-3-small',
  chunks: [],
  parseStatus: 'idle',
  parseError: null,
  parseProgress: 0,
  sourceCharCount: 0,
  sourceText: '',
  sourceImageData: '',
  sourceImageFilename: '',
  docMetadata: null,
  userMeta: { doc_id: '', category: '', tags: '', author: '', language: 'en' },
  chunkSize: 640,
  chunkOverlap: 80,
  maxKeywords: 4,
  enableImages: false,
  enableOcr: false,
  manualBoundaries: null,
});
