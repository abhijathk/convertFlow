import type { ChunkStrategy } from '../stores/chunkState';

export interface ChunkParams {
  maxTokens?: number;
  overlap?: number;
  maxParagraphTokens?: number;
  similarityThreshold?: number;
  minChunkTokens?: number;
}

export interface RawChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_OVERLAP = 50;
const DEFAULT_PARA_TOKENS = 512;
const DEFAULT_SIM_THRESHOLD = 0.15;
const DEFAULT_MIN_TOKENS = 80;

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z]{2,}\b/g) ?? [];
}

// Scan forward from `hint` to find `needle` in `haystack`.
function findOffset(haystack: string, needle: string, hint: number): number {
  const idx = haystack.indexOf(needle, hint);
  return idx === -1 ? hint : idx;
}

// Convert an array of text strings into RawChunks by scanning the source for each.
function attachOffsets(source: string, texts: string[]): RawChunk[] {
  const result: RawChunk[] = [];
  let cursor = 0;
  for (const text of texts) {
    const start = findOffset(source, text, cursor);
    const end = start + text.length;
    result.push({ text, startOffset: start, endOffset: end });
    cursor = end;
  }
  return result;
}

// ── Fixed-size chunking ───────────────────────────────────────────────────────

export function fixedChunk(text: string, params: ChunkParams = {}): RawChunk[] {
  const maxTok = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTok = params.overlap ?? DEFAULT_OVERLAP;
  const overlapChars = overlapTok * 4;

  const wordList = text.split(/(\s+)/);
  const texts: string[] = [];
  let current = '';
  let overlap = '';

  for (const token of wordList) {
    if (approxTokens(current + token) > maxTok && current.trim()) {
      texts.push((overlap + current).trimStart());
      const raw = current.trimStart();
      overlap = raw.length > overlapChars ? raw.slice(-overlapChars) : raw;
      current = '';
    }
    current += token;
  }
  if (current.trim()) texts.push((overlap + current).trimStart());
  const filtered = texts.filter(c => c.trim().length > 0);
  return attachOffsets(text, filtered);
}

// ── Paragraph chunking ────────────────────────────────────────────────────────

const HEADING_RE = /^#{1,6}\s/;

export function paragraphChunk(text: string, params: ChunkParams = {}): RawChunk[] {
  const maxTok = params.maxParagraphTokens ?? DEFAULT_PARA_TOKENS;

  const rawBlocks = text.split(/\n\n+/);
  const blocks: string[] = [];
  for (const block of rawBlocks) {
    const lines = block.split('\n');
    let current = '';
    for (const line of lines) {
      if (HEADING_RE.test(line) && current.trim()) {
        blocks.push(current.trim());
        current = line + '\n';
      } else {
        current += line + '\n';
      }
    }
    if (current.trim()) blocks.push(current.trim());
  }

  const chunkTexts: string[] = [];
  let acc = '';

  for (const block of blocks) {
    if (approxTokens(acc + '\n\n' + block) <= maxTok) {
      acc = acc ? acc + '\n\n' + block : block;
    } else {
      if (acc.trim()) chunkTexts.push(acc.trim());
      if (approxTokens(block) > maxTok) {
        fixedChunk(block, { maxTokens: maxTok }).forEach(rc => chunkTexts.push(rc.text));
        acc = '';
      } else {
        acc = block;
      }
    }
  }
  if (acc.trim()) chunkTexts.push(acc.trim());
  const filtered = chunkTexts.filter(c => c.trim().length > 0);
  return attachOffsets(text, filtered);
}

// ── Semantic chunking (Jaccard-based) ─────────────────────────────────────────

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

export function semanticChunk(text: string, params: ChunkParams = {}): RawChunk[] {
  const threshold = params.similarityThreshold ?? DEFAULT_SIM_THRESHOLD;
  const minTok = params.minChunkTokens ?? DEFAULT_MIN_TOKENS;
  const maxTok = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  const windowSize = 3;

  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])|\n{2,}/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length <= 1) {
    if (!sentences.length) return [];
    const trimmed = text.trim();
    const start = text.indexOf(trimmed);
    return [{ text: trimmed, startOffset: start, endOffset: start + trimmed.length }];
  }

  const wordSets: Set<string>[] = sentences.map(s => new Set(words(s)));
  const boundaries: number[] = [0];

  for (let i = windowSize; i < sentences.length; i++) {
    const prevWords = new Set<string>();
    const currWords = new Set<string>();
    for (let j = i - windowSize; j < i; j++) wordSets[j].forEach(w => prevWords.add(w));
    for (let j = i; j < Math.min(i + windowSize, sentences.length); j++) wordSets[j].forEach(w => currWords.add(w));

    if (jaccard(prevWords, currWords) < threshold) {
      boundaries.push(i);
    }
  }
  boundaries.push(sentences.length);

  const rawTexts: string[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const chunk = sentences.slice(boundaries[i], boundaries[i + 1]).join(' ');
    rawTexts.push(chunk);
  }

  const mergedTexts: string[] = [];
  let acc = '';
  for (const chunk of rawTexts) {
    const candidate = acc ? acc + ' ' + chunk : chunk;
    if (approxTokens(acc) < minTok) {
      acc = candidate;
    } else if (approxTokens(candidate) > maxTok) {
      if (acc.trim()) mergedTexts.push(acc.trim());
      if (approxTokens(chunk) > maxTok) {
        fixedChunk(chunk, { maxTokens: maxTok }).forEach(rc => mergedTexts.push(rc.text));
        acc = '';
      } else {
        acc = chunk;
      }
    } else {
      if (acc.trim()) mergedTexts.push(acc.trim());
      acc = chunk;
    }
  }
  if (acc.trim()) mergedTexts.push(acc.trim());

  const filtered = mergedTexts.filter(c => c.trim().length > 0);
  return attachOffsets(text, filtered);
}

// ── Embedding-based semantic chunking ─────────────────────────────────────────

/**
 * Async embedding-based chunking. Sentence-splits, embeds each sentence,
 * finds cosine-similarity breakpoints at the 25th percentile, then groups
 * sentences into chunks within the token budget.
 *
 * Must be called from within the chunk worker (never the main thread) because
 * transformers.js pipeline is loaded there.
 */
export async function embeddingChunk(
  text: string,
  params: ChunkParams = {},
  onProgress?: (loaded: number, total: number) => void,
): Promise<RawChunk[]> {
  const maxTok = params.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Sentence-split
  const rawSentences = text.split(/[.!?]+\s+/).map(s => s.trim()).filter(s => s.length > 0);
  if (rawSentences.length <= 1) {
    return fixedChunk(text, params);
  }

  // Dynamically import embeddings so this module can still be imported on the
  // main thread (the import resolves only inside the worker).
  const { embedBatch, cosineSimilarity } = await import('./embeddings');

  const embeddings = await embedBatch(rawSentences, onProgress);

  // Compute pairwise similarities between consecutive sentences
  const similarities: number[] = [];
  for (let i = 0; i < embeddings.length - 1; i++) {
    similarities.push(cosineSimilarity(embeddings[i], embeddings[i + 1]));
  }

  // 25th-percentile threshold
  const sorted = [...similarities].sort((a, b) => a - b);
  const p25idx = Math.floor(sorted.length * 0.25);
  const threshold = sorted[p25idx] ?? 0;

  // Identify breakpoints: indices where similarity < threshold
  const breakpoints = new Set<number>();
  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i] < threshold) {
      breakpoints.add(i + 1); // break BEFORE sentence i+1
    }
  }

  // Greedily group sentences into chunks
  const chunkTexts: string[] = [];
  let acc: string[] = [];

  for (let i = 0; i < rawSentences.length; i++) {
    const sentence = rawSentences[i];
    const candidate = [...acc, sentence].join(' ');
    const tokCount = approxTokens(candidate);

    const isBreakpoint = breakpoints.has(i);
    const isOverBudget = tokCount > maxTok;

    if ((isBreakpoint || isOverBudget) && acc.length > 0) {
      chunkTexts.push(acc.join(' '));
      acc = [sentence];
    } else {
      acc.push(sentence);
    }
  }
  if (acc.length > 0) chunkTexts.push(acc.join(' '));

  const filtered = chunkTexts.filter(c => c.trim().length > 0);
  return attachOffsets(text, filtered);
}

// ── Late chunking ─────────────────────────────────────────────────────────────

/**
 * Compute late-chunking embeddings for an array of RawChunks.
 * Encodes the full document once, then mean-pools token embeddings per chunk span.
 *
 * Falls back to per-chunk embedding when source > 512 tokens (MiniLM limit).
 * Returns { embeddings, lateChunked } — lateChunked=false signals the fallback.
 */
export async function lateChunkEmbeddings(
  text: string,
  rawChunks: RawChunk[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ embeddings: Float32Array[]; lateChunked: boolean }> {
  const { embedTokens, poolTokensForChunk, embedBatch, MINILM_MAX_TOKENS } =
    await import('./embeddings');

  const approxSourceTokens = approxTokens(text);

  if (approxSourceTokens > MINILM_MAX_TOKENS) {
    // Source too long for late-chunking with MiniLM — fall back to per-chunk
    console.warn(
      `[late-chunking] Source is ~${approxSourceTokens} tokens; MiniLM limit is ${MINILM_MAX_TOKENS}. ` +
        'Falling back to per-chunk embedding. Use jina-embeddings-v2 for true late chunking on long docs.',
    );
    const embeddings = await embedBatch(
      rawChunks.map(c => c.text),
      onProgress,
    );
    return { embeddings, lateChunked: false };
  }

  // Full-document token embeddings
  const { tokenEmbeddings, tokenOffsets } = await embedTokens(text, onProgress);

  const embeddings: Float32Array[] = rawChunks.map(chunk =>
    poolTokensForChunk(tokenEmbeddings, tokenOffsets, chunk.startOffset, chunk.endOffset),
  );

  return { embeddings, lateChunked: true };
}

// ── Router ────────────────────────────────────────────────────────────────────

export function chunkText(text: string, strategy: ChunkStrategy, params?: ChunkParams): RawChunk[] {
  if (!text.trim()) return [];
  switch (strategy) {
    case 'fixed': return fixedChunk(text, params);
    case 'paragraph': return paragraphChunk(text, params);
    case 'semantic': return semanticChunk(text, params);
    case 'embedding':
      // embeddingChunk is async; callers must use it directly.
      // Fallback to semantic for synchronous callers (bulk-import path).
      return semanticChunk(text, params);
  }
}
