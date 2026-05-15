import { writable } from 'svelte/store';

export type ChunkStrategy = 'fixed' | 'paragraph' | 'semantic' | 'embedding';
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
  source?: string;           // filename, e.g. "report.pdf"
  source_type?: 'pdf' | 'md' | 'txt' | 'html' | 'image' | 'csv' | 'jsonl' | 'unknown';
  page?: number;             // 1-indexed PDF page; only present when source_type === 'pdf'
  section?: string;          // markdown heading the chunk falls under; only for md
  embedding?: number[];      // dense vector embedding (float32, normalized)
  late_chunked?: boolean;    // true = embedding computed via late-chunking; false = per-chunk fallback
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
  lateChunking: boolean;
}

const STORAGE_KEY = 'dataprep:chunk-state-v1';

function defaultState(): ChunkState {
  // Pick up chunk-tab defaults from appSettings if they exist. localStorage
  // may not be available during SSR/early hydration, so guard with try/catch.
  let imagesDefault = false;
  let ocrDefault = false;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('dataprep:appSettings') : null;
    if (raw) {
      const parsed = JSON.parse(raw) as { chunkEnableImagesDefault?: boolean; chunkEnableOcrDefault?: boolean };
      imagesDefault = !!parsed.chunkEnableImagesDefault;
      ocrDefault = !!parsed.chunkEnableOcrDefault;
    }
  } catch { /* ignore */ }
  return {
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
    enableImages: imagesDefault,
    enableOcr: ocrDefault,
    manualBoundaries: null,
    lateChunking: false,
  };
}

function loadFromStorage(): ChunkState {
  const ds = defaultState();
  if (typeof localStorage === 'undefined') return ds;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ds;
    const parsed = JSON.parse(raw) as Partial<ChunkState>;
    // In-flight statuses ('uploading' / 'parsing') are stale on reload — reset
    // them to 'idle'. Keep 'done' / 'error' / 'idle' as-is so chunked state
    // continues to render correctly.
    const persistedStatus = parsed.parseStatus;
    const safeStatus: ParseStatus =
      persistedStatus === 'uploading' || persistedStatus === 'parsing'
        ? 'idle'
        : (persistedStatus ?? 'idle');
    return {
      ...ds,
      ...parsed,
      parseStatus: safeStatus,
      parseProgress: 0,
      parseError: safeStatus === 'error' ? (parsed.parseError ?? null) : null,
    };
  } catch {
    return ds;
  }
}

export const chunkState = writable<ChunkState>(
  typeof localStorage !== 'undefined' ? loadFromStorage() : defaultState()
);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
chunkState.subscribe(state => {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded (large base64 image, long source text) — drop the
      // largest fields and try again so settings still persist.
      try {
        const trimmed = { ...state, sourceImageData: '', chunks: [] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch { /* give up */ }
    }
  }, 500);
});
