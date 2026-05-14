<script lang="ts">
  import { get } from 'svelte/store';
  import { fileToConversationalJsonl, fileToConversationalJsonlMulti } from '../lib/convert-import';
  import { chunkText } from '../lib/chunk';
  import type { ImportTemplate } from '../lib/convert-import';
  import type { ExportFormat } from '../stores/convertState';
  import { extractPdfText, extractPdfTextWithOcr } from '../lib/pdf-loader';
  import { convertPrepState } from '../stores/convertPrepState';
  import ChunkLoader from './ChunkLoader.svelte';

  interface Props {
    exportFormat: ExportFormat;
    existingNames?: string[];
    ongenerate: (results: Array<{
      jsonl: string;
      filename: string;
      rawSource: string;
      template?: ImportTemplate;
      systemPrompt?: string;
      chunkSize?: number;
      prompts?: string[];
      promptMode?: 'round-robin' | 'random';
      promptSeed?: number;
    }>) => void;
    onclose: () => void;
  }

  let { exportFormat, existingNames = [], ongenerate, onclose }: Props = $props();

  // ── Per-format configuration ──────────────────────────────────────────────

  const formatInfo: Record<ExportFormat, { title: string; description: string; showChunkSize: boolean; datasetFormat: boolean }> = {
    jsonl:    { title: 'Generate conversational JSONL',  description: 'Chunk document → wrap each chunk as a conversation example ready for fine-tuning.',  showChunkSize: true,  datasetFormat: true  },
    json:     { title: 'Convert document to JSON',       description: 'Full document → JSON array of paragraphs.',                                           showChunkSize: false, datasetFormat: false },
    csv:      { title: 'Convert document to CSV',        description: 'Full document → CSV rows with paragraph and content columns.',                        showChunkSize: false, datasetFormat: false },
    parquet:  { title: 'Convert document to Parquet',    description: 'Full document → Parquet rows. Downloads as .parquet.',                               showChunkSize: false, datasetFormat: false },
    md:       { title: 'Convert document to Markdown',   description: 'Full document → Markdown with paragraph headings.',                                   showChunkSize: false, datasetFormat: false },
    txt:      { title: 'Convert document to plain text', description: 'Full document → plain text with paragraph separators.',                              showChunkSize: false, datasetFormat: false },
    alpaca:   { title: 'Generate Alpaca JSONL',          description: 'Chunk document → each chunk becomes the input field. Fill instruction and output.',   showChunkSize: true,  datasetFormat: true  },
    sharegpt: { title: 'Generate ShareGPT JSONL',        description: 'Chunk document → each chunk becomes a human turn. Assistant responses left blank.',   showChunkSize: true,  datasetFormat: true  },
    tsv:      { title: 'Convert document to TSV',        description: 'Full document → tab-separated rows.',                                                showChunkSize: false, datasetFormat: false },
  };

  // ── State ─────────────────────────────────────────────────────────────────

  let isDragging = $state(false);
  let isProcessing = $state(false);
  let processingMsg = $state('');
  let errorMsg = $state('');
  let loadedFiles: { name: string; text: string }[] = $state([]);
  let fileInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();

  // ── Derived ───────────────────────────────────────────────────────────────

  let info = $derived(formatInfo[exportFormat]);
  const ACCEPT_ALL = '.txt,.md,.markdown,.docx,.pdf,.csv,.xlsx,.xls,.json,.jsonl,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,text/plain,text/markdown,text/csv,application/json,application/jsonl,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/*';
  let acceptString = $derived(ACCEPT_ALL);

  // ── Format-specific output builders ──────────────────────────────────────

  function buildOutput(text: string): string {
    const prep = get(convertPrepState);

    if (exportFormat === 'jsonl' || exportFormat === 'alpaca' || exportFormat === 'sharegpt') {
      const tmpl: ImportTemplate = exportFormat === 'alpaca' ? 'instruct'
        : exportFormat === 'sharegpt' ? 'qa'
        : prep.template;

      if (prep.multiPromptEnabled && exportFormat === 'jsonl') {
        return fileToConversationalJsonlMulti(text, tmpl, {
          mode: prep.multiPromptMode,
          seed: prep.multiPromptSeed,
          prompts: prep.multiPrompts,
        }, prep.chunkSize);
      }
      return fileToConversationalJsonl(text, tmpl, prep.systemPrompt, prep.chunkSize);
    }

    // Document formats (json/csv/md/txt/parquet/tsv)
    const chunks = chunkText(text, 'fixed', { maxTokens: prep.chunkSize, overlap: 0 })
      .filter(c => c.text.trim().length > 0);
    return chunks.map((c, i) => JSON.stringify({ chunk_index: i, content: c.text })).join('\n');
  }

  // ── File handling ─────────────────────────────────────────────────────────

  const SUPPORTED_EXTS = new Set(['txt','md','markdown','json','jsonl','csv','docx','pdf','xlsx','xls','png','jpg','jpeg','webp','gif','bmp','tiff']);
  const IMAGE_EXTS = new Set(['png','jpg','jpeg','webp','gif','bmp','tiff']);

  async function extractText(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (['txt', 'md', 'markdown', 'json', 'jsonl', 'csv'].includes(ext)) {
      return file.text();
    }
    if (ext === 'docx') {
      const { default: mammoth } = await import('mammoth');
      const buffer = await file.arrayBuffer();
      const textResult = await mammoth.extractRawText({ arrayBuffer: buffer });
      let docxText = textResult.value;
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
        processingMsg = `OCR ${images.length} image${images.length > 1 ? 's' : ''} in ${file.name}…`;
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const ocrTexts: string[] = [];
        for (let i = 0; i < images.length; i++) {
          processingMsg = `OCR image ${i + 1}/${images.length} in ${file.name}…`;
          try {
            const { data: { text: imgText } } = await worker.recognize(`data:${images[i].contentType};base64,${images[i].data}`);
            if (imgText.trim()) ocrTexts.push(imgText.trim());
          } catch {}
        }
        await worker.terminate();
        if (ocrTexts.length > 0) docxText = docxText.trim() ? `${docxText}\n\n${ocrTexts.join('\n\n')}` : ocrTexts.join('\n\n');
      }
      return docxText;
    }
    if (ext === 'xlsx' || ext === 'xls') {
      if (file.size > 5_000_000) throw new Error('XLSX too large (max 5MB) — open in spreadsheet app first');
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      let cellCount = 0;
      for (const sheet of Object.values(wb.Sheets) as any[]) {
        cellCount += Object.keys(sheet).filter(k => !k.startsWith('!')).length;
      }
      if (cellCount > 100_000) throw new Error('XLSX has too many cells (max 100,000)');
      return wb.SheetNames.map(name => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        return wb.SheetNames.length > 1 ? `--- ${name} ---\n${csv}` : csv;
      }).join('\n\n');
    }
    if (ext === 'pdf') {
      processingMsg = `loading ${file.name}…`;
      return extractPdfTextWithOcr(file, msg => { processingMsg = msg; });
    }
    if (IMAGE_EXTS.has(ext)) {
      processingMsg = `OCR ${file.name}…`;
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const blobUrl = URL.createObjectURL(file);
      try {
        const { data: { text: ocrText } } = await worker.recognize(blobUrl);
        return ocrText.trim();
      } finally {
        URL.revokeObjectURL(blobUrl);
        await worker.terminate();
      }
    }
    throw new Error(`${file.name.split('.').pop()?.toUpperCase()} not supported`);
  }

  async function loadFiles(files: File[]) {
    const supported = files.filter(f => SUPPORTED_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? ''));
    if (!supported.length) { errorMsg = 'No supported files — use .txt .md .docx .pdf .csv .xlsx .json .png .jpg'; return; }

    const existing = new Set(existingNames);
    const dupes = supported.filter(f => existing.has(f.name));
    const fresh = supported.filter(f => !existing.has(f.name));

    if (dupes.length > 0 && fresh.length === 0) {
      errorMsg = dupes.length === 1
        ? `"${dupes[0].name}" is already in the dataset — remove it first.`
        : `All ${dupes.length} files are already in the dataset — remove them first.`;
      return;
    }
    if (dupes.length > 0) {
      errorMsg = dupes.map(f => f.name).join(', ') + ` already imported — skipped.`;
    }
    isProcessing = true;
    loadedFiles = [];
    for (let i = 0; i < fresh.length; i++) {
      const file = fresh[i];
      processingMsg = fresh.length > 1
        ? `reading ${file.name}… (${i + 1}/${fresh.length})`
        : `reading ${file.name}…`;
      try {
        const text = await extractText(file);
        loadedFiles = [...loadedFiles, { name: file.name, text }];
      } catch (err) {
        errorMsg = `Could not read ${file.name}: ${String(err)}`;
      }
    }
    isProcessing = false;
    processingMsg = '';
  }

  function generate() {
    if (!loadedFiles.length) { errorMsg = 'Drop or select files above first.'; return; }
    errorMsg = '';

    // Snapshot the prep state at generation time so the DatasetFile record
    // carries the exact settings that produced the output.
    const prep = get(convertPrepState);

    const results: Array<{
      jsonl: string;
      filename: string;
      rawSource: string;
      template?: ImportTemplate;
      systemPrompt?: string;
      chunkSize?: number;
      prompts?: string[];
      promptMode?: 'round-robin' | 'random';
      promptSeed?: number;
    }> = [];

    for (const f of loadedFiles) {
      try {
        const output = buildOutput(f.text);
        if (output.trim()) results.push({
          jsonl: output,
          filename: f.name,
          rawSource: f.text,
          template: prep.template,
          systemPrompt: prep.systemPrompt,
          chunkSize: prep.chunkSize,
          ...(prep.multiPromptEnabled ? {
            prompts: prep.multiPrompts,
            promptMode: prep.multiPromptMode,
            promptSeed: prep.multiPromptSeed,
          } : {}),
        });
      } catch (err) {
        errorMsg = `Error generating ${f.name}: ${String(err)}`;
        return;
      }
    }
    if (!results.length) { errorMsg = 'No text found in loaded files.'; return; }
    ongenerate(results);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault(); isDragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) loadFiles(files);
  }

  function handleDragOver(e: DragEvent) { e.preventDefault(); isDragging = true; }
  function handleDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) isDragging = false;
  }
  function handleFileSelect(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    (e.target as HTMLInputElement).value = '';
    if (files.length) loadFiles(files);
  }
</script>

<div
  class="import-panel"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
>
  <button class="close-btn" onclick={onclose} title="Close">×</button>

  <!-- Header line -->
  <div class="header-row">
    <span class="header-title">{info.title}</span>
    <span class="header-desc">{info.description}</span>
  </div>

  <!-- Drop zone -->
  <div
    class="drop-zone"
    class:dragging={isDragging}
    class:has-file={loadedFiles.length > 0}
    class:busy={isProcessing}
    onclick={() => { if (!isProcessing && fileInput) { fileInput.value = ''; fileInput.click(); } }}
    role="button"
    tabindex={isProcessing ? -1 : 0}
    aria-label="Click or drop files to import"
    onkeydown={e => { if (!isProcessing && e.key === 'Enter' && fileInput) { fileInput.value = ''; fileInput.click(); } }}
  >
    {#if isProcessing}
      <span class="drop-hint processing-msg">{processingMsg}</span>
    {:else if loadedFiles.length === 1}
      <span class="drop-hint file-loaded">
        <span class="file-name">{loadedFiles[0].name}</span>
        <span class="file-change">· click to change</span>
      </span>
    {:else if loadedFiles.length > 1}
      <span class="drop-hint file-loaded">
        <span class="file-name">{loadedFiles.length} files loaded</span>
        <span class="file-change">· click to change</span>
      </span>
    {:else}
      <span class="drop-hint">drop files here, or click to select · <button class="folder-btn" onclick={(e) => { e.stopPropagation(); if (folderInput) { folderInput.value = ''; folderInput.click(); } }}>select folder</button></span>
    {/if}
  </div>

  <input bind:this={fileInput} type="file" multiple accept={acceptString} style="display:none" onchange={handleFileSelect} />
  <input bind:this={folderInput} type="file" webkitdirectory style="display:none" onchange={handleFileSelect} />

  {#if isProcessing}
    <ChunkLoader status="parsing" progress={0} sourceCharCount={0} />
  {/if}

  <!-- Generate button -->
  <div class="controls-row">
    <button
      class="generate-btn"
      onclick={generate}
      disabled={isProcessing || !loadedFiles.length}
      title={loadedFiles.length ? 'Generate from loaded files' : 'Load files first'}
    >{loadedFiles.length ? 'Generate →' : 'load files first'}</button>
  </div>

  {#if errorMsg}
    <div class="error-row">× {errorMsg}</div>
  {/if}
</div>

<style>
  /* All selectors wrapped in :global() — Svelte 5 build was tree-shaking
     this component's scoped CSS away. :global keeps the rules in the bundle.
     Class names are unique to this panel so global scope is safe. */
  :global(.import-panel) {
    position: relative;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex-shrink: 0;
    font-size: 12px;
  }

  :global(.import-panel .close-btn) {
    position: absolute;
    top: 8px;
    right: 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--ink-dim);
    line-height: 1;
    padding: 0 4px;
  }
  :global(.import-panel .close-btn:hover) { color: var(--ink); }

  :global(.import-panel .header-row) {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  :global(.import-panel .header-title) {
    color: var(--ink);
    font-weight: 500;
    white-space: nowrap;
  }
  :global(.import-panel .header-desc) {
    color: var(--ink-dim);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.import-panel .drop-zone) {
    border: 1px dashed var(--border);
    border-radius: 3px;
    padding: 10px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.1s, background 0.1s;
  }
  :global(.import-panel .drop-zone:hover:not(.busy)),
  :global(.import-panel .drop-zone.dragging) {
    border-color: var(--accent);
    background: rgba(224, 168, 78, 0.05);
  }
  :global(.import-panel .drop-zone.has-file) {
    border-style: solid;
    border-color: var(--ok);
    background: rgba(138, 181, 107, 0.04);
  }
  :global(.import-panel .drop-zone.busy) { cursor: default; opacity: 0.6; }
  :global(.import-panel .drop-hint) { color: var(--ink-dim); }
  :global(.import-panel .processing-msg) { color: var(--accent); font-size: 11px; }
  :global(.import-panel .file-loaded) { color: var(--ink); }
  :global(.import-panel .file-name) { color: var(--ok); font-weight: 500; }
  :global(.import-panel .file-change) { color: var(--ink-dim); margin-left: 6px; }
  :global(.import-panel .folder-btn) {
    background: none;
    border: none;
    color: var(--accent);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  :global(.import-panel .folder-btn:hover) { color: var(--ink); }

  :global(.import-panel .controls-row) {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.import-panel .generate-btn) {
    margin-left: auto;
    background: none;
    border: 1px solid var(--accent);
    border-radius: 2px;
    color: var(--accent);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  :global(.import-panel .generate-btn:hover:not(:disabled)) { background: rgba(224, 168, 78, 0.1); }
  :global(.import-panel .generate-btn:disabled) { opacity: 0.35; cursor: default; border-color: var(--border); color: var(--ink-dim); }

  :global(.import-panel .error-row) { color: var(--err); font-size: 12px; }
</style>
