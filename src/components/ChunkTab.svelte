<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { chunkState } from '../stores/chunkState';
  import { analytics } from '../lib/analytics';
  import { isMac } from '../lib/platform';
  import { encodeChunkShare, decodeShareFragment } from '../lib/share-url';
  import EditorIsland from './EditorIsland.svelte';
  import ChunkStrategyPicker from './ChunkStrategyPicker.svelte';
  import ChunkEmbedderPicker from './ChunkEmbedderPicker.svelte';
  import ChunkTrustStrip from './ChunkTrustStrip.svelte';
  import ChunksList from './ChunksList.svelte';
  import ChunkPreview from './ChunkPreview.svelte';
  import ChunkMetadataPanel from './ChunkMetadataPanel.svelte';
  import ChunkBoundaryOverlay from './ChunkBoundaryOverlay.svelte';
  import type { ChunkResult, ChunkError } from '../workers/chunk.worker';
  import { openFileWithSplitPane } from '../stores/editorState';
  import { setTab, shellState, consumePendingChunkSource } from '../stores/shellState';
  import { setToolInput, selectedUtilityId } from '../stores/utilitiesState';

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
  //   label "source text" ~76  +  format-select ~52  +  share ~50  +  upload ~54  +  collapse ~22  +  gaps ~16  +  padding 28  = ~298
  //   add "clear ×" (~54 + 4 gap) when active = ~356
  // Use CSS min-width on the panel (enforced even if flex-basis drifts lower).
  const MIN_EDITOR_BASE  = 300; // px — label + JSONL + share + upload + ‹
  const MIN_EDITOR_CLEAR = 358; // px — + clear × button
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

  let editorWidth     = $state(400);
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

  let editorRef: EditorIsland | undefined = $state();
  let editorWrapEl: HTMLDivElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let isDragging = $state(false);
  let worker: Worker | undefined;
  let copyFeedback = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressNextChange = false;
  let hasContent = $state(false);
  let confirmingClear = $state(false);

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

  function runChunking(text: string) {
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
    });
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
    const content = editorRef?.getValue() ?? '';
    if (content.trim()) runChunking(content);
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
      docMetadata: { format: ext, sizeBytes: file.size },
    }));

    try {
      let text = '';

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
        const { extractPdfText, extractPdfTextWithOcr } = await import('../lib/pdf-loader');
        if (enableOcr) {
          text = await extractPdfTextWithOcr(file, () => {
            chunkState.update(s => ({ ...s, parseStatus: 'parsing' }));
          });
        } else {
          text = await extractPdfText(file);
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

        // Build a single image chunk and write it directly to state
        const content = ocrText || `[Image: ${file.name}]`;
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
          image_data: dataUrl,
          image_filename: file.name,
        };

        suppressNextChange = true;
        editorRef?.setValue(content);
        hasContent = true;
        chunkState.update(s => ({
          ...s,
          chunks: [imageChunk],
          sourceText: content,
          sourceCharCount: content.length,
          parseStatus: 'idle',
          parseProgress: 0,
          docMetadata: { format: ext, sizeBytes: file.size },
          manualBoundaries: null,
        }));
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

      // Auto-chunk after a successful parse. Without this, OCR on images / PDFs
      // produces text but the user has to click "generate" before any chunks appear.
      runChunking(text);

    } catch (err) {
      chunkState.update(s => ({
        ...s,
        parseStatus: 'error',
        parseError: `Could not read file: ${String(err)}`,
      }));
    }
  }

  function handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) parseFile(file);
    if (fileInput) fileInput.value = '';
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) parseFile(file);
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
    worker?.terminate();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<ChunkStrategyPicker />
<ChunkEmbedderPicker />

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
        <div class="toolbar-left">
          <span class="toolbar-label">source text</span>
          <select
            class="format-select"
            value={exportFormat}
            onchange={(e) => (exportFormat = e.currentTarget.value as ChunkExportFormat)}
            disabled={$chunkState.chunks.length > 0}
            title={$chunkState.chunks.length > 0 ? 'Format locked — clear editor to change' : 'Output format'}
            aria-label="Output format"
          >
            <option value="jsonl">JSONL</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        <div class="toolbar-actions">
          {#if $chunkState.chunks.length > 0 || $chunkState.parseStatus !== 'idle'}
            <button class="clear-btn" onclick={clearAll} title="Clear editor and chunks">clear ×</button>
          {/if}
          <button class="upload-btn" onclick={openFilePicker}>import ↓</button>
          <button class="upload-btn" onclick={openInEditor} disabled={!hasContent} title="Edit source in Editor tab (⌘3)">↗ Editor</button>
          <button class="upload-btn" onclick={openInUtilities} disabled={!hasContent} title="Analyze source in Utilities tab">↗ Utilities</button>
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
    <ChunksList
      selectedIndex={selectedChunkIndex}
      onselect={(i) => (selectedChunkIndex = i)}
      {exportFormat}
    />
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
  accept={[
    '.txt,.md,.markdown,.json,.jsonl,.csv,.docx,.pdf',
    $chunkState.enableImages ? '.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff' : ''
  ].filter(Boolean).join(',')}
  style="display:none"
  onchange={handleFileSelect}
/>

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
    justify-content: space-between;
    height: 32px;
    padding: 0 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow: hidden;
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
</style>
