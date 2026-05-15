<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { chunkState } from '../stores/chunkState';
  import { analytics } from '../lib/analytics';
  import { isMac } from '../lib/platform';
  import { encodeChunkShare, decodeShareFragment } from '../lib/share-url';
  import EditorIsland from './EditorIsland.svelte';
  import CsvTableView from './CsvTableView.svelte';
  import ChunkStrategyPicker from './ChunkStrategyPicker.svelte';
  import ChunkEmbedderPicker from './ChunkEmbedderPicker.svelte';
  import ChunkTrustStrip from './ChunkTrustStrip.svelte';
  import ChunksList from './ChunksList.svelte';
  import ChunkPreview from './ChunkPreview.svelte';
  import ChunkMetadataPanel from './ChunkMetadataPanel.svelte';
  import ChunkBoundaryOverlay from './ChunkBoundaryOverlay.svelte';
  import type { ChunkResult, ChunkError, EmbeddingProgress } from '../workers/chunk.worker';
  import { openFileWithSplitPane } from '../stores/editorState';
  import { setTab, shellState, consumePendingChunkSource, chunkStatsOpen } from '../stores/shellState';
  import ChunkStatsPanel from './ChunkStatsPanel.svelte';
  import { setToolInput, selectedUtilityId } from '../stores/utilitiesState';
  import { embedText, embedBatch, cosineSimilarity } from '../lib/embeddings';

  // ── Retrieval test (feature #3) ──────────────────────────────────────────
  let retrievalQuery = $state('');
  let retrievalResults = $state<{ index: number; score: number }[]>([]);
  let retrievalStatus = $state<'idle' | 'embedding' | 'querying' | 'ready' | 'error'>('idle');
  let retrievalError = $state('');
  // Cache: index -> Float32Array. Computed on-demand when chunks lack embedding field.
  let retrievalCache = $state<Map<number, Float32Array>>(new Map());

  async function ensureChunkEmbeddings(): Promise<Float32Array[] | null> {
    const chunks = $chunkState.chunks;
    if (chunks.length === 0) return null;
    const out: Float32Array[] = [];
    let needCompute: { index: number; text: string }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].embedding) {
        out.push(new Float32Array(chunks[i].embedding!));
      } else if (retrievalCache.has(i)) {
        out.push(retrievalCache.get(i)!);
      } else {
        out.push(new Float32Array());
        needCompute.push({ index: i, text: chunks[i].content });
      }
    }

    if (needCompute.length > 0) {
      retrievalStatus = 'embedding';
      const embs = await embedBatch(needCompute.map(c => c.text));
      const updated = new Map(retrievalCache);
      needCompute.forEach((c, i) => {
        out[c.index] = embs[i];
        updated.set(c.index, embs[i]);
      });
      retrievalCache = updated;
    }
    return out;
  }

  async function runRetrieval() {
    const q = retrievalQuery.trim();
    if (!q || $chunkState.chunks.length === 0) {
      retrievalResults = [];
      retrievalStatus = 'idle';
      return;
    }
    retrievalError = '';
    try {
      const chunkEmbs = await ensureChunkEmbeddings();
      if (!chunkEmbs) return;
      retrievalStatus = 'querying';
      const queryEmb = await embedText(q);
      const scored = chunkEmbs.map((emb, idx) => ({
        index: idx,
        score: emb.length > 0 ? cosineSimilarity(queryEmb, emb) : -1,
      }));
      retrievalResults = scored
        .filter(r => r.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      retrievalStatus = 'ready';
    } catch (err) {
      retrievalStatus = 'error';
      retrievalError = err instanceof Error ? err.message : String(err);
    }
  }

  // Clear cache when chunks change
  $effect(() => {
    void $chunkState.chunks;
    retrievalCache = new Map();
    retrievalResults = [];
    if (retrievalStatus !== 'idle') retrievalStatus = 'idle';
  });

  let retrievalDebounce: ReturnType<typeof setTimeout> | undefined;
  function onRetrievalInput() {
    if (retrievalDebounce) clearTimeout(retrievalDebounce);
    retrievalDebounce = setTimeout(() => runRetrieval(), 350);
  }

  function openInUtilities() {
    const source = $chunkState.sourceText ?? '';
    if (source) {
      setToolInput('token-estimator', source);
      setToolInput('embedding-budget', source);
    }
    selectedUtilityId.set('embedding-budget');
    setTab('utilities');
  }

  type ChunkExportFormat = 'jsonl' | 'json' | 'csv';

  // ── panel resize ─────────────────────────────────────────────────────────
  // Editor toolbar content (approx px at 12px font, gap 4px, padding 14px each side):
  //   "Export as:" ~60 + format-select ~52 + generate → ~76 + collapse ‹ ~22
  //   + gaps ~16 + padding 28 = ~254
  //   add "clear ×" (~54 + 4 gap) when chunks exist = ~312
  // Use CSS min-width on the panel (enforced even if flex-basis drifts lower).
  const MIN_EDITOR_BASE  = 270; // px — Export as + JSONL + generate + ‹
  const MIN_EDITOR_CLEAR = 330; // px — + clear × button
  // export bar: 28px padding + ~140px label + ~44px copy + 6px gap + ~72px download = ~290px
  const MIN_LIST         = 290; // px — export bar: chunk count + copy + download
  // preview toolbar: ~150px chunk-id + ~120px nav-actions + 28px padding = ~300px
  // stats bar: "127 tokens · 507 chars · 76 words · density ▄" ~263px content + 36px gaps + 28px padding = ~330px
  const MIN_PREVIEW      = 340; // px — stats bar is the widest fixed row (extra margin for density glyph)

  // Reactive: minimum grows when the clear button is present
  let minEditorWidth = $derived(
    ($chunkState.chunks.length > 0 || $chunkState.parseStatus !== 'idle')
      ? MIN_EDITOR_CLEAR
      : MIN_EDITOR_BASE
  );

  let editorWidth     = $state(420);
  let listWidth       = $state(290);
  let isPanelDragging = $state(false);
  let chunkBodyEl: HTMLDivElement | undefined = $state();

  function startEditorDrag(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = editorWidth;
    isPanelDragging = true;
    function onMove(ev: MouseEvent) {
      editorWidth = Math.max(minEditorWidth, startW + ev.clientX - startX);
    }
    function onUp() {
      isPanelDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startListDrag(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    isPanelDragging = true;
    function onMove(ev: MouseEvent) {
      const bodyWidth = chunkBodyEl?.clientWidth ?? Infinity;
      const editorW   = editorCollapsed ? 32 : editorWidth;
      const handles   = editorCollapsed ? 5 : 10; // 5px per handle
      const maxList   = bodyWidth - editorW - handles - MIN_PREVIEW;
      listWidth = Math.max(MIN_LIST, Math.min(maxList, startW + ev.clientX - startX));
    }
    function onUp() {
      isPanelDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  // ─────────────────────────────────────────────────────────────────────────

  let selectedChunkIndex = $state<number | undefined>(undefined);
  let editorCollapsed = $state(false);
  let exportFormat = $state<ChunkExportFormat>('jsonl');
  let statsOpen = $derived($chunkStatsOpen);

  let editorRef: EditorIsland | undefined = $state();
  let editorWrapEl: HTMLDivElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();
  let isDragging = $state(false);
  let worker: Worker | undefined;
  let copyFeedback = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressNextChange = false;
  let hasContent = $state(false);
  let confirmingClear = $state(false);

  // Bulk-import state (#10)
  let batchStatus = $state('');   // e.g. "Processing 3/12: report.pdf…"
  let batchToast = $state('');    // end-of-batch summary toast
  let batchToastTimer: ReturnType<typeof setTimeout> | undefined;

  // Embedding model download banner (Feature #1 / #2)
  let embeddingProgress = $state<{ loaded: number; total: number } | null>(null);
  let embeddingModelLoaded = $state(false);
  let embeddingModelToastTimer: ReturnType<typeof setTimeout> | undefined;


  // Format-specific source-panel rendering. Image data lives in chunkState
  // (sourceImageData / sourceImageFilename) so the source preview shows it
  // immediately on upload, before the user clicks Generate.
  let sourceFormat = $derived($chunkState.docMetadata?.format ?? '');
  let isImageSource = $derived(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'].includes(sourceFormat));
  let isCsvSource = $derived(sourceFormat === 'csv');
  let isPdfSource = $derived(sourceFormat === 'pdf');
  let sourceImageData = $derived($chunkState.sourceImageData);
  let sourceImageFilename = $derived($chunkState.sourceImageFilename);

  // Resolve a filename extension to the source_type enum used in ChunkMeta
  function extToSourceType(ext: string): import('../stores/chunkState').ChunkMeta['source_type'] {
    if (ext === 'pdf') return 'pdf';
    if (ext === 'md' || ext === 'markdown') return 'md';
    if (ext === 'txt') return 'txt';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (['png','jpg','jpeg','webp','gif','bmp','tiff'].includes(ext)) return 'image';
    if (ext === 'csv') return 'csv';
    if (ext === 'jsonl') return 'jsonl';
    return 'unknown';
  }

  function getWorker(): Worker {
    if (!worker) {
      worker = new Worker(new URL('../workers/chunk.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<ChunkResult | ChunkError>) => {
        if (e.data.type === 'result') {
          chunkState.update(s => ({
            ...s,
            chunks: e.data.type === 'result' ? e.data.chunks : s.chunks,
            parseStatus: 'done',
          }));
        } else {
          chunkState.update(s => ({
            ...s,
            parseStatus: 'error',
            parseError: (e.data as ChunkError).message,
          }));
        }
      };
      worker.onerror = (err) => {
        chunkState.update(s => ({ ...s, parseStatus: 'error', parseError: err.message }));
      };
    }
    return worker;
  }

  function runChunking(
    text: string,
    source?: string,
    source_type?: import('../stores/chunkState').ChunkMeta['source_type'],
    page_offsets?: number[],
  ) {
    selectedChunkIndex = undefined;
    if (!text.trim()) {
      chunkState.update(s => ({
        ...s,
        chunks: [],
        parseStatus: 'idle',
        parseError: null,
        parseProgress: 0,
        sourceText: '',
        manualBoundaries: null,
      }));
      return;
    }
    chunkState.update(s => ({ ...s, parseStatus: 'parsing', parseProgress: 10, sourceCharCount: text.length, sourceText: text, manualBoundaries: null }));
    const state = $chunkState;
    getWorker().postMessage({
      type: 'chunk',
      text,
      strategy: state.strategy,
      params: {
        maxTokens: state.chunkSize,
        overlap: state.chunkOverlap,
        maxParagraphTokens: state.chunkSize,
      },
      source,
      source_type,
      page_offsets,
    });
  }

  // ── Bulk folder/multi-file import (#10) ───────────────────────────────────

  const SUPPORTED_BULK_EXTS = new Set(['txt','md','markdown','json','jsonl','csv','docx','pdf']);

  /** Process multiple files sequentially, aggregate chunks with continuous index. */
  async function processFiles(files: File[]) {
    const supported = files.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      return SUPPORTED_BULK_EXTS.has(ext) ||
        ($chunkState.enableImages && ['png','jpg','jpeg','webp','gif','bmp','tiff'].includes(ext));
    });
    const skipped = files.length - supported.length;

    if (supported.length === 0) {
      batchToast = `Skipped ${skipped} unsupported file${skipped !== 1 ? 's' : ''}.`;
      if (batchToastTimer) clearTimeout(batchToastTimer);
      batchToastTimer = setTimeout(() => (batchToast = ''), 4000);
      return;
    }

    // For single files delegate to the existing single-file path (keeps editor sync)
    if (supported.length === 1 && skipped === 0) {
      await parseFile(supported[0]);
      return;
    }

    // Multi-file batch mode: collect all chunks then write to state at once
    chunkState.update(s => ({
      ...s,
      parseStatus: 'parsing',
      parseProgress: 5,
      parseError: null,
      chunks: [],
      manualBoundaries: null,
    }));

    const { enrichChunks } = await import('../lib/rag-metadata');
    const { chunkText: doChunk } = await import('../lib/chunk');
    const state = $chunkState;

    const allChunks: import('../stores/chunkState').ChunkMeta[] = [];
    let importedCount = 0;
    let failedCount = 0;
    const failedNames: string[] = [];

    for (let fi = 0; fi < supported.length; fi++) {
      const file = supported[fi];
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      batchStatus = `Processing ${fi + 1}/${supported.length}: ${file.name}…`;

      try {
        const source_type = extToSourceType(ext);
        let text = '';
        let page_offsets: number[] | undefined;

        if (['txt','md','markdown','json','jsonl'].includes(ext)) {
          text = await file.text();
        } else if (ext === 'csv') {
          const raw = await file.text();
          text = csvToText(raw);
        } else if (ext === 'docx') {
          const { default: mammoth } = await import('mammoth');
          const buffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer: buffer });
          text = result.value;
        } else if (ext === 'pdf') {
          const { loadPdfJs } = await import('../lib/pdf-loader');
          const pdfjsLib = await loadPdfJs();
          const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
          const pageTexts: string[] = [];
          page_offsets = [];
          let cumulative = 0;
          for (let p = 1; p <= pdf.numPages; p++) {
            page_offsets.push(cumulative);
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const t = content.items.map((item: any) => item.str ?? '').join(' ').trim();
            pageTexts.push(t);
            cumulative += t.length + 2; // +2 for the '\n\n' join
          }
          text = pageTexts.join('\n\n').trim();
        } else if (['png','jpg','jpeg','webp','gif','bmp','tiff'].includes(ext)) {
          if ($chunkState.enableOcr) {
            const { createWorker: createTesseract } = await import('tesseract.js');
            const tWorker = await createTesseract('eng');
            const dataUrl = await new Promise<string>((res, rej) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result as string);
              reader.onerror = () => rej(new Error('Failed to read image'));
              reader.readAsDataURL(file);
            });
            const { data: { text: ocrText } } = await tWorker.recognize(dataUrl);
            await tWorker.terminate();
            text = ocrText.trim() || `[Image: ${file.name}]`;
          } else {
            text = `[Image: ${file.name}]`;
          }
        }

        if (!text.trim()) { failedCount++; failedNames.push(file.name); continue; }

        // Build section_map for markdown inline (mirrors worker logic)
        let section_map: string[] | undefined;
        const raw = doChunk(text, state.strategy, {
          maxTokens: state.chunkSize,
          overlap: state.chunkOverlap,
          maxParagraphTokens: state.chunkSize,
        });

        if (source_type === 'md') {
          const headings: { offset: number; text: string }[] = [];
          const headingRe = /^(#{1,6})\s+(.+)$/gm;
          let hm: RegExpExecArray | null;
          while ((hm = headingRe.exec(text)) !== null) {
            headings.push({ offset: hm.index, text: hm[2].trim() });
          }
          section_map = raw.map(chunk => {
            for (let hi = headings.length - 1; hi >= 0; hi--) {
              if (headings[hi].offset <= chunk.startOffset) return headings[hi].text;
            }
            return '';
          });
        }

        const enriched = await enrichChunks(raw, {
          source: file.name,
          source_type,
          page_offsets,
          section_map,
        }, allChunks.length);

        // Fix total_siblings — each file contributes to the running total
        for (const c of enriched) {
          allChunks.push({ ...c, total_siblings: raw.length });
        }
        importedCount++;
      } catch {
        failedCount++;
        failedNames.push(file.name);
      }
    }

    batchStatus = '';
    // Renumber chunk_id consistently and set total_siblings to grand total
    const total = allChunks.length;
    const finalChunks = allChunks.map((c, i) => ({
      ...c,
      chunk_id: `chunk-${i + 1}`,
      chunk_index: i,
      total_siblings: total,
    }));

    chunkState.update(s => ({
      ...s,
      chunks: finalChunks,
      parseStatus: finalChunks.length > 0 ? 'done' : 'error',
      parseError: finalChunks.length === 0 ? 'No text found in any file.' : null,
      parseProgress: 0,
      sourceText: '',
      sourceCharCount: finalChunks.reduce((sum, c) => sum + c.char_count, 0),
      manualBoundaries: null,
    }));

    if (finalChunks.length > 0) selectedChunkIndex = 0;

    let toastParts = [`Imported ${importedCount} file${importedCount !== 1 ? 's' : ''}`];
    const totalSkipped = skipped + failedCount;
    if (totalSkipped > 0) toastParts.push(`skipped ${totalSkipped} unsupported`);
    batchToast = toastParts.join(', ') + '.';
    if (batchToastTimer) clearTimeout(batchToastTimer);
    batchToastTimer = setTimeout(() => (batchToast = ''), 5000);
  }

  function selectPrev() {
    if (selectedChunkIndex === undefined || selectedChunkIndex === 0) return;
    selectedChunkIndex -= 1;
  }

  function selectNext() {
    const chunks = $chunkState.chunks;
    if (selectedChunkIndex === undefined || selectedChunkIndex >= chunks.length - 1) return;
    selectedChunkIndex += 1;
  }

  function handleEditorChange(content: string) {
    if (suppressNextChange) { suppressNextChange = false; return; }
    hasContent = content.trim().length > 0;
  }

  function generate() {
    // Image source → produce a single image chunk that bundles the image data
    // + OCR text. Skip the text chunker entirely.
    const s = $chunkState;
    if (s.sourceImageData) {
      const content = s.sourceText || `[Image: ${s.sourceImageFilename}]`;
      const chunkId = `img-${Date.now().toString(36)}`;
      const imageChunk: import('../stores/chunkState').ChunkMeta = {
        chunk_id: chunkId,
        chunk_index: 0,
        total_siblings: 1,
        hash: chunkId,
        char_count: content.length,
        word_count: content.split(/\s+/).filter(Boolean).length,
        approx_tokens: Math.ceil(content.length / 4),
        keywords: [],
        density_score: 1,
        content,
        startOffset: 0,
        endOffset: content.length,
        image_data: s.sourceImageData,
        image_filename: s.sourceImageFilename,
      };
      chunkState.update(prev => ({ ...prev, chunks: [imageChunk], parseStatus: 'done' }));
      selectedChunkIndex = 0;
      return;
    }
    const content = editorRef?.getValue() ?? '';
    if (content.trim()) {
      const s = $chunkState as any;
      runChunking(
        content,
        s._pendingSource,
        s._pendingSourceType,
        s._pendingPageOffsets,
      );
    }
  }

  // ── CSV → readable text ───────────────────────────────────────────────────
  // Converts each CSV row into "key: value | key: value ..." so the chunker
  // works with human-readable text instead of raw comma-separated tokens.

  function parseCsvRow(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { fields.push(field); field = ''; }
        else { field += ch; }
      }
    }
    fields.push(field);
    return fields;
  }

  function csvToText(raw: string): string {
    const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return raw; // no data rows — fall back to raw
    const headers = parseCsvRow(lines[0]);
    const records: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvRow(lines[i]);
      const parts = headers.map((h, j) => {
        const v = (vals[j] ?? '').trim();
        return v ? `${h.trim()}: ${v}` : null;
      }).filter(Boolean);
      if (parts.length > 0) records.push(parts.join(' | '));
    }
    return records.join('\n');
  }

  // ── File parsing ──────────────────────────────────────────────────────────

  async function parseFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const enableOcr    = $chunkState.enableOcr;
    const enableImages = $chunkState.enableImages;

    chunkState.update(s => ({
      ...s,
      parseStatus: 'uploading',
      parseProgress: 20,
      parseError: null,
      // Reset stale image state from a previous upload — the image-file branch
      // sets these again, every other branch leaves them empty.
      sourceImageData: '',
      sourceImageFilename: '',
      docMetadata: { format: ext, sizeBytes: file.size },
    }));

    try {
      let text = '';
      let page_offsets: number[] | undefined;

      if (['txt', 'md', 'markdown', 'json', 'jsonl'].includes(ext)) {
        text = await file.text();

      } else if (ext === 'csv') {
        const raw = await file.text();
        text = csvToText(raw);

      } else if (ext === 'docx') {
        const { default: mammoth } = await import('mammoth');
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        text = result.value;

        if (enableOcr) {
          const images: { contentType: string; data: string }[] = [];
          try {
            await mammoth.convertToHtml({ arrayBuffer: buffer }, {
              convertImage: mammoth.images.imgElement(async (image: any) => {
                try {
                  const data = await image.read('base64');
                  images.push({ contentType: image.contentType || 'image/png', data });
                } catch {}
                return { src: '' };
              }),
            });
          } catch {}
          if (images.length > 0) {
            chunkState.update(s => ({ ...s, parseStatus: 'parsing', parseProgress: 50 }));
            const { createWorker } = await import('tesseract.js');
            const worker = await createWorker('eng');
            const ocrTexts: string[] = [];
            for (const img of images) {
              try {
                const { data: { text: t } } = await worker.recognize(`data:${img.contentType};base64,${img.data}`);
                if (t.trim()) ocrTexts.push(t.trim());
              } catch {}
            }
            await worker.terminate();
            if (ocrTexts.length > 0) {
              text = text.trim() ? `${text}\n\n${ocrTexts.join('\n\n')}` : ocrTexts.join('\n\n');
            }
          }
        }

      } else if (ext === 'pdf') {
        chunkState.update(s => ({ ...s, parseStatus: 'parsing', parseProgress: 30 }));
        // Extract page_offsets alongside text so chunks can carry page numbers.
        const { loadPdfJs } = await import('../lib/pdf-loader');
        const pdfjsLib = await loadPdfJs();
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const pageTexts: string[] = [];
        page_offsets = [];
        let cumulative = 0;
        for (let p = 1; p <= pdf.numPages; p++) {
          page_offsets.push(cumulative);
          const page = await pdf.getPage(p);
          if (enableOcr) {
            chunkState.update(s => ({ ...s, parseStatus: 'parsing', parseProgress: 30 + Math.floor((p / pdf.numPages) * 40) }));
          }
          const content = await page.getTextContent();
          const t = content.items.map((item: any) => item.str ?? '').join(' ').trim();
          pageTexts.push(t);
          cumulative += t.length + 2;
        }
        text = pageTexts.join('\n\n').trim();

        // Run OCR on empty pages if requested
        if (enableOcr) {
          const emptyPages = pageTexts.reduce<number[]>((acc, t, i) => (!t ? [...acc, i + 1] : acc), []);
          if (emptyPages.length > 0) {
            const { createWorker } = await import('tesseract.js');
            const tWorker = await createWorker('eng');
            const pdfjsLib2 = await loadPdfJs();
            const pdf2 = await pdfjsLib2.getDocument({ data: await file.arrayBuffer() }).promise;
            for (const pageNum of emptyPages) {
              const pg = await pdf2.getPage(pageNum);
              const viewport = pg.getViewport({ scale: 2 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await pg.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
              const { data: { text: ocrT } } = await tWorker.recognize(canvas);
              pageTexts[pageNum - 1] = ocrT.trim();
            }
            await tWorker.terminate();
            // Rebuild text and page_offsets with OCR results
            page_offsets = [];
            let cum2 = 0;
            for (const pt of pageTexts) {
              page_offsets.push(cum2);
              cum2 += pt.length + 2;
            }
            text = pageTexts.join('\n\n').trim();
          }
        }

      } else if (enableImages && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'].includes(ext)) {
        chunkState.update(s => ({ ...s, parseStatus: 'parsing', parseProgress: 40 }));

        // Read image as base64 data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(file);
        });

        // OCR if user enabled it; otherwise leave OCR text empty
        let ocrText = '';
        if (enableOcr) {
          const { createWorker } = await import('tesseract.js');
          const worker = await createWorker('eng');
          try {
            const { data: { text: t } } = await worker.recognize(dataUrl);
            ocrText = t.trim();
          } finally {
            await worker.terminate();
          }
        }

        // Stash the image data + OCR text in state so the source panel can
        // display it, but DO NOT create a chunk yet — generate() will do that
        // when the user clicks the button.
        const content = ocrText || `[Image: ${file.name}]`;
        suppressNextChange = true;
        editorRef?.setValue(content);
        hasContent = true;
        chunkState.update(s => ({
          ...s,
          chunks: [],
          sourceText: content,
          sourceCharCount: content.length,
          sourceImageData: dataUrl,
          sourceImageFilename: file.name,
          parseStatus: 'idle',
          parseProgress: 0,
          docMetadata: { format: ext, sizeBytes: file.size },
          manualBoundaries: null,
        }));
        selectedChunkIndex = undefined;
        analytics.fileUploaded(ext);
        return; // Skip the text-chunking path below

      } else {
        chunkState.update(s => ({
          ...s,
          parseStatus: 'error',
          parseError: `${ext.toUpperCase()} not yet supported — paste text directly.`,
        }));
        return;
      }

      suppressNextChange = true;
      editorRef?.setValue(text);
      hasContent = text.trim().length > 0;
      if (!hasContent) {
        chunkState.update(s => ({
          ...s,
          parseStatus: 'error',
          parseError: 'No text found in file. Check the file has readable content.',
        }));
        return;
      }
      chunkState.update(s => ({ ...s, parseStatus: 'idle', parseProgress: 0 }));
      analytics.fileUploaded(ext);
      // Store page_offsets on state so generate() can pass them to the worker
      (chunkState.update as Function)(s => ({
        ...s,
        _pendingPageOffsets: page_offsets,
        _pendingSource: file.name,
        _pendingSourceType: extToSourceType(ext),
      }));

    } catch (err) {
      chunkState.update(s => ({
        ...s,
        parseStatus: 'error',
        parseError: `Could not read file: ${String(err)}`,
      }));
    }
  }

  function handleFileSelect(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    if (fileInput) fileInput.value = '';
    if (folderInput) folderInput.value = '';
    if (files.length > 1) {
      processFiles(files);
    } else if (files.length === 1) {
      parseFile(files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 1) {
      processFiles(files);
    } else if (files.length === 1) {
      parseFile(files[0]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      isDragging = false;
    }
  }

  function openInEditor() {
    const content = editorRef?.getValue() ?? '';
    if (!content.trim()) return;
    const fmt = $chunkState.docMetadata?.format ?? 'txt';
    const name = `chunk-source.${fmt}`;
    // Pick a preview format that differs from the source so the right pane shows
    // a meaningful conversion (e.g. source text → JSONL training pairs).
    const splitFmt = fmt === 'jsonl' ? 'csv'
      : fmt === 'csv' ? 'jsonl'
      : fmt === 'json' ? 'jsonl'
      : 'jsonl';
    openFileWithSplitPane(name, content, splitFmt);
    setTab('editor');
  }

  function openFilePicker() {
    fileInput?.click();
  }

  function openFolderPicker() {
    folderInput?.click();
  }

  function clearAll() {
    const hasData = (editorRef?.getValue() ?? '').trim().length > 0 || $chunkState.chunks.length > 0;
    if (!hasData) return;
    confirmingClear = true;
  }

  function confirmClearAll() {
    suppressNextChange = true;
    editorRef?.setValue('');
    selectedChunkIndex = undefined;
    hasContent = false;
    chunkState.update(s => ({
      ...s,
      chunks: [],
      parseStatus: 'idle',
      parseError: null,
      parseProgress: 0,
      sourceCharCount: 0,
      sourceText: '',
      sourceImageData: '',
      sourceImageFilename: '',
      manualBoundaries: null,
    }));
    confirmingClear = false;
  }

  function copyShareLink() {
    const s = $chunkState;
    const encoded = encodeChunkShare(s.strategy, s.embedderId, s.chunkSize, s.chunkOverlap);
    const url = `${location.origin}${location.pathname}#t=chunk&s=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      if (copyTimer) clearTimeout(copyTimer);
      copyFeedback = 'copied';
      copyTimer = setTimeout(() => (copyFeedback = ''), 2000);
      analytics.shareCopied();
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      copyShareLink();
    }
  }

  onMount(() => {
    const payload = decodeShareFragment(location.hash);
    if (payload?.tab === 'chunk') {
      chunkState.update(s => ({
        ...s,
        strategy: payload.strategy as typeof s.strategy,
        embedderId: payload.embedderId,
        chunkSize: payload.chunkSize ?? s.chunkSize,
        chunkOverlap: payload.chunkOverlap ?? s.chunkOverlap,
      }));
      analytics.shareOpenedFromUrl();
    }

    // Rehydrate the source editor + content flag from persisted chunkState.
    // Without this, the source text is in localStorage but the Monaco editor
    // on the left renders empty until the user uploads something new.
    const persistedSource = $chunkState.sourceText;
    if (persistedSource) {
      hasContent = true;
      if ($chunkState.chunks.length > 0) {
        selectedChunkIndex = 0;
      }
      // Wait one tick so editorRef is bound.
      queueMicrotask(() => {
        if (editorRef && persistedSource) {
          suppressNextChange = true;
          editorRef.setValue(persistedSource);
        }
      });
    }
  });

  // Consume pendingChunkSource when set (Send-from-Editor)
  $effect(() => {
    if ($shellState.pendingChunkSource && editorRef) {
      const source = consumePendingChunkSource();
      if (source) {
        suppressNextChange = true;
        editorRef.setValue(source);
        hasContent = source.trim().length > 0;
      }
    }
  });

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
    if (batchToastTimer) clearTimeout(batchToastTimer);
    worker?.terminate();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<ChunkStrategyPicker
  onImport={openFilePicker}
  onFolder={openFolderPicker}
  onEditor={openInEditor}
  onUtilities={openInUtilities}
  actionsDisabled={!hasContent}
/>
<ChunkEmbedderPicker />

{#if statsOpen}
  <ChunkStatsPanel />
{:else}
<div class="chunk-body" class:panel-dragging={isPanelDragging} bind:this={chunkBodyEl}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="editor-side"
    class:dragging={isDragging}
    class:collapsed={editorCollapsed}
    style={editorCollapsed ? 'flex: 0 0 32px; min-width: 32px' : `flex: 0 0 ${editorWidth}px; min-width: ${minEditorWidth}px`}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <div class="editor-toolbar">
      {#if editorCollapsed}
        <button
          class="collapse-btn"
          onclick={() => (editorCollapsed = false)}
          title="Expand source"
          aria-label="Expand source panel"
        >›</button>
      {:else}
        <div class="toolbar-actions">
          <label class="format-label">
            <span class="format-label-text">Export as:</span>
            <select
              class="format-select"
              value={exportFormat}
              onchange={(e) => (exportFormat = e.currentTarget.value as ChunkExportFormat)}
              disabled={$chunkState.chunks.length > 0}
              title={$chunkState.chunks.length > 0 ? 'Format locked — clear editor to change' : 'Output format for generated chunks'}
              aria-label="Output format"
            >
              <option value="jsonl">JSONL</option>
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          {#if $chunkState.chunks.length > 0 || $chunkState.parseStatus !== 'idle'}
            <button class="clear-btn" onclick={clearAll} title="Clear editor and chunks">clear ×</button>
          {/if}
          <button class="generate-btn" onclick={generate} disabled={!hasContent}>generate →</button>
          <button
            class="collapse-btn"
            onclick={() => (editorCollapsed = true)}
            title="Collapse source"
            aria-label="Collapse source panel"
          >‹</button>
        </div>
      {/if}
    </div>
    {#if !editorCollapsed}
      <div class="editor-wrap" bind:this={editorWrapEl}>
        <EditorIsland
          bind:this={editorRef}
          mode="markdown"
          placeholder="// drop a file or import ↓ · hand-edit in Editor tab (⌘3)"
          ariaLabel="Source document viewer (read-only)"
          editable={false}
          onchange={handleEditorChange}
        />
        {#if isImageSource && sourceImageData}
          <div class="source-format-overlay source-image-overlay">
            <img class="source-image" src={sourceImageData} alt={sourceImageFilename || 'Source image'} loading="lazy" />
            {#if sourceImageFilename}
              <span class="source-image-caption">{sourceImageFilename}</span>
            {/if}
            {#if hasContent && $chunkState.sourceText && !$chunkState.sourceText.startsWith('[Image:')}
              <details class="source-ocr-text">
                <summary>OCR text ({$chunkState.sourceText.length} chars)</summary>
                <pre>{$chunkState.sourceText}</pre>
              </details>
            {/if}
          </div>
        {:else if isCsvSource && $chunkState.sourceText}
          <div class="source-format-overlay source-csv-overlay">
            <CsvTableView csvText={$chunkState.sourceText} delimiter="," hasHeader={true} />
          </div>
        {:else if isPdfSource && hasContent}
          <div class="source-format-banner">
            <span><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:4px"><path d="M4 1h5l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z"/><path d="M9 1v3h3"/><line x1="5.5" y1="7.5" x2="10.5" y2="7.5"/><line x1="5.5" y1="9.5" x2="10.5" y2="9.5"/><line x1="5.5" y1="11.5" x2="8.5" y2="11.5"/></svg>{$chunkState.docMetadata?.format?.toUpperCase()} — text extracted ({$chunkState.sourceCharCount.toLocaleString()} chars)</span>
          </div>
        {/if}
        <ChunkBoundaryOverlay containerEl={editorWrapEl} onresetToAuto={generate} />
      </div>
      {#if isDragging}
        <div class="drop-overlay" aria-hidden="true">
          <span>drop file here</span>
        </div>
      {/if}
    {/if}
  </div>

  {#if !editorCollapsed}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="panel-handle" onmousedown={startEditorDrag} aria-hidden="true"></div>
  {/if}

  <div class="list-pane" style="flex: 0 0 {listWidth}px; min-width: {MIN_LIST}px">
    <div class="list-scroll">
      <ChunksList
        selectedIndex={selectedChunkIndex}
        onselect={(i) => (selectedChunkIndex = i)}
        {exportFormat}
      />
    </div>
    {#if $chunkState.chunks.length > 0}
      <div class="retrieval-test" aria-label="Retrieval test">
        <input
          type="text"
          class="retrieval-input"
          placeholder="test retrieval — type a question…"
          bind:value={retrievalQuery}
          oninput={onRetrievalInput}
          onkeydown={(e) => { if (e.key === 'Enter') runRetrieval(); }}
        />
        {#if retrievalStatus === 'embedding'}
          <div class="retrieval-status">computing chunk embeddings…</div>
        {:else if retrievalStatus === 'querying'}
          <div class="retrieval-status">searching…</div>
        {:else if retrievalStatus === 'error'}
          <div class="retrieval-status retrieval-err">{retrievalError}</div>
        {:else if retrievalStatus === 'ready' && retrievalResults.length > 0}
          <ul class="retrieval-results">
            {#each retrievalResults as r}
              <button class="retrieval-row" onclick={() => (selectedChunkIndex = r.index)}>
                <span class="retrieval-score">{r.score.toFixed(3)}</span>
                <span class="retrieval-snippet">
                  #{r.index + 1} · {$chunkState.chunks[r.index]?.content.slice(0, 80) ?? ''}
                </span>
              </button>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="panel-handle" onmousedown={startListDrag} aria-hidden="true"></div>

  <div class="preview-pane">
    <div class="sponsor-strip">
      <!-- affiliate slot: replace href and label below -->
      <a href="#" target="_blank" rel="noopener noreferrer sponsored" class="sponsor-link">
        sponsored
      </a>
    </div>
    <ChunkPreview
      chunk={selectedChunkIndex !== undefined ? $chunkState.chunks[selectedChunkIndex] : undefined}
      prevChunk={selectedChunkIndex !== undefined && selectedChunkIndex > 0 ? $chunkState.chunks[selectedChunkIndex - 1] : undefined}
      nextChunk={selectedChunkIndex !== undefined && selectedChunkIndex < $chunkState.chunks.length - 1 ? $chunkState.chunks[selectedChunkIndex + 1] : undefined}
      selectedIndex={selectedChunkIndex}
      total={$chunkState.chunks.length}
      {exportFormat}
      onprev={selectPrev}
      onnext={selectNext}
    />
  </div>
</div>
{/if}

<ChunkMetadataPanel />
<ChunkTrustStrip />

{#if copyFeedback}
  <div class="copy-toast" role="status" aria-live="polite">✓ {copyFeedback}</div>
{/if}

{#if confirmingClear}
  <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label="Clear editor and chunks">
    <div class="confirm-box">
      <p class="confirm-title">Clear editor and <span class="confirm-accent">{$chunkState.chunks.length}</span> chunk{$chunkState.chunks.length === 1 ? '' : 's'}?</p>
      <p class="confirm-sub">This will empty the source and remove generated chunks. Cannot be undone.</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-clear" onclick={confirmClearAll}>clear</button>
        <button class="confirm-btn confirm-cancel" onclick={() => (confirmingClear = false)}>cancel</button>
      </div>
    </div>
  </div>
{/if}

<input
  bind:this={fileInput}
  type="file"
  multiple
  accept={[
    '.txt,.md,.markdown,.json,.jsonl,.csv,.docx,.pdf',
    $chunkState.enableImages ? '.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff' : ''
  ].filter(Boolean).join(',')}
  style="display:none"
  onchange={handleFileSelect}
/>
<input
  bind:this={folderInput}
  type="file"
  webkitdirectory
  style="display:none"
  onchange={handleFileSelect}
/>

{#if batchStatus}
  <div class="batch-status" role="status" aria-live="polite">{batchStatus}</div>
{/if}

{#if batchToast}
  <div class="copy-toast batch-toast" role="status" aria-live="polite">{batchToast}</div>
{/if}

<style>
  .chunk-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .chunk-body.panel-dragging {
    cursor: col-resize;
    user-select: none;
  }

  /* ── drag handles ── */
  .panel-handle {
    flex: 0 0 5px;
    position: relative;
    cursor: col-resize;
    background: transparent;
    z-index: 2;
  }

  .panel-handle::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: var(--border);
    transition: width 0.12s, left 0.12s, background 0.12s;
  }

  .panel-handle:hover::after,
  .panel-dragging .panel-handle::after {
    left: 1px;
    width: 3px;
    background: var(--accent);
  }

  /* ── panel wrappers ── */
  .list-pane {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }
  .list-scroll {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Retrieval test (feature #3) ───────────────────────────────────────── */
  .retrieval-test {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--surface);
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
  }
  .retrieval-input {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 11px;
  }
  .retrieval-input:focus { outline: none; border-color: var(--accent); }
  .retrieval-status {
    font-size: 10px;
    color: var(--muted);
    padding: 2px 4px;
  }
  .retrieval-err { color: var(--err); }
  .retrieval-results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .retrieval-row {
    background: none;
    border: none;
    text-align: left;
    padding: 4px 6px;
    border-radius: 2px;
    cursor: pointer;
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-family: inherit;
    color: var(--ink);
    font-size: 11px;
  }
  .retrieval-row:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .retrieval-score {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    min-width: 38px;
  }
  .retrieval-snippet {
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .preview-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 340px;
  }

  /* ── editor side ── */
  .editor-side {
    /* width controlled by inline style */
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .editor-side.collapsed {
    overflow: hidden;
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    height: 32px;
    padding: 0 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow: visible;
  }

  .editor-side.collapsed .editor-toolbar {
    justify-content: center;
    padding: 0;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .toolbar-label {
    font-size: 12px;
    color: var(--ink-dim);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .toolbar-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    padding: 2px 6px;
    border-radius: 2px;
  }

  .toolbar-btn:hover { background: var(--border); color: var(--ink); }

  .upload-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
    padding: 2px 6px;
    border-radius: 2px;
  }

  .upload-btn:hover { background: var(--border); }

  .generate-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    font-weight: 600;
    padding: 1px 8px;
  }

  .generate-btn:hover:not(:disabled) { background: var(--border); }
  .generate-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .clear-btn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--err) 40%, transparent);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--err);
    padding: 1px 6px;
    opacity: 0.7;
  }

  .clear-btn:hover { opacity: 1; background: color-mix(in srgb, var(--err) 10%, transparent); }

  .collapse-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    color: var(--ink-dim);
    padding: 0 4px;
    line-height: 32px;
    border-radius: 2px;
  }

  .collapse-btn:hover { background: var(--border); color: var(--ink); }

  .format-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-right: 4px;
  }
  .format-label-text {
    font-size: 11px;
    color: var(--ink-dim);
    white-space: nowrap;
  }

  .format-select {
    appearance: none;
    -webkit-appearance: none;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 11px;
    padding: 1px 16px 1px 5px;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='%23a8a296' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
  }

  .format-select:hover:not(:disabled) { border-color: var(--ink-dim); }
  .format-select:disabled { opacity: 0.45; cursor: not-allowed; }
  .format-select option { background: var(--surface); color: var(--ink); }

  .copy-toast {
    position: fixed;
    bottom: 40px;
    right: 16px;
    background: var(--surface);
    border: 1px solid var(--ok);
    border-radius: 3px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--ok);
    z-index: 50;
    pointer-events: none;
  }

  .editor-wrap {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  .dragging .editor-wrap { opacity: 0.4; pointer-events: none; }

  /* ── Format-specific source-panel overlays ───────────────── */
  .source-format-overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    background: var(--bg);
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  .source-image-overlay {
    padding: 14px 16px;
    align-items: flex-start;
    gap: 10px;
  }
  .source-image {
    max-width: 100%;
    max-height: 60%;
    object-fit: contain;
    background: #000;
    border: 1px solid var(--border);
    border-radius: 3px;
  }
  .source-image-caption {
    font-size: 12px;
    color: var(--ink-dim);
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .source-ocr-text {
    width: 100%;
    margin-top: 8px;
    font-size: 11px;
    color: var(--ink-dim);
  }
  .source-ocr-text summary {
    cursor: pointer;
    padding: 4px 0;
    user-select: none;
  }
  .source-ocr-text summary:hover { color: var(--ink); }
  .source-ocr-text pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 8px 10px;
    margin: 4px 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    max-height: 240px;
    overflow: auto;
  }
  .source-csv-overlay {
    padding: 0;
  }
  .source-format-banner {
    position: absolute;
    top: 6px;
    left: 12px;
    z-index: 4;
    font-size: 11px;
    color: var(--ink-dim);
    background: color-mix(in srgb, var(--surface) 80%, transparent);
    padding: 3px 9px;
    border-radius: 3px;
    pointer-events: none;
  }

  .drop-overlay {
    position: absolute;
    inset: 32px 0 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(14, 17, 22, 0.85);
    border: 2px dashed var(--accent);
    font-size: 14px;
    color: var(--accent);
    pointer-events: none;
  }

  .sponsor-strip {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 24px;
    padding: 0 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sponsor-link {
    font-size: 11px;
    color: var(--muted);
    text-decoration: none;
    letter-spacing: 0.02em;
  }

  .sponsor-link:hover { color: var(--ink-dim); }

  /* ── confirm dialog ── */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .confirm-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 20px 24px;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .confirm-title {
    font-size: 13px;
    color: var(--ink);
    margin: 0;
  }
  .confirm-accent { color: var(--accent); }
  .confirm-sub {
    font-size: 12px;
    color: var(--ink-dim);
    margin: 0 0 12px 0;
  }
  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .confirm-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 12px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
  }
  .confirm-btn:hover { color: var(--ink); }
  .confirm-clear {
    color: var(--err);
    border-color: color-mix(in srgb, var(--err) 40%, transparent);
  }
  .confirm-clear:hover { background: color-mix(in srgb, var(--err) 10%, transparent); }

  .batch-status {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 4px 14px;
    font-size: 12px;
    color: var(--accent);
    z-index: 50;
    pointer-events: none;
    white-space: nowrap;
  }

  .batch-toast {
    bottom: 68px;
  }
</style>
