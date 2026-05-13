<script lang="ts">
  import { fileToConversationalJsonl } from '../lib/convert-import';
  import { chunkText } from '../lib/chunk';
  import type { ImportTemplate } from '../lib/convert-import';
  import type { ExportFormat } from '../stores/convertState';
  import { extractPdfText, extractPdfTextWithOcr } from '../lib/pdf-loader';
  import ChunkLoader from './ChunkLoader.svelte';

  interface Props {
    exportFormat: ExportFormat;
    existingNames?: string[];
    ongenerate: (results: Array<{ jsonl: string; filename: string; rawSource: string }>) => void;
    onclose: () => void;
  }

  let { exportFormat, existingNames = [], ongenerate, onclose }: Props = $props();

  // ── Per-format configuration ──────────────────────────────────────────────

  const formatInfo: Record<ExportFormat, { title: string; description: string; showTemplates: boolean; showChunkSize: boolean; datasetFormat: boolean }> = {
    jsonl:    { title: 'Generate conversational JSONL',  description: 'Chunk document → wrap each chunk as a conversation example ready for fine-tuning.',  showTemplates: true,  showChunkSize: true,  datasetFormat: true  },
    json:     { title: 'Convert document to JSON',       description: 'Full document → JSON array of paragraphs.',                                           showTemplates: false, showChunkSize: false, datasetFormat: false },
    csv:      { title: 'Convert document to CSV',        description: 'Full document → CSV rows with paragraph and content columns.',                        showTemplates: false, showChunkSize: false, datasetFormat: false },
    parquet:  { title: 'Convert document to Parquet',    description: 'Full document → Parquet rows. Downloads as .parquet.',                               showTemplates: false, showChunkSize: false, datasetFormat: false },
    md:       { title: 'Convert document to Markdown',   description: 'Full document → Markdown with paragraph headings.',                                   showTemplates: false, showChunkSize: false, datasetFormat: false },
    txt:      { title: 'Convert document to plain text', description: 'Full document → plain text with paragraph separators.',                              showTemplates: false, showChunkSize: false, datasetFormat: false },
    alpaca:   { title: 'Generate Alpaca JSONL',          description: 'Chunk document → each chunk becomes the input field. Fill instruction and output.',   showTemplates: false, showChunkSize: true,  datasetFormat: true  },
    sharegpt: { title: 'Generate ShareGPT JSONL',        description: 'Chunk document → each chunk becomes a human turn. Assistant responses left blank.',   showTemplates: false, showChunkSize: true,  datasetFormat: true  },
  };

  // ── Per-template configuration (JSONL only) ───────────────────────────────

  const templateDefs: Record<ImportTemplate, { label: string; defaultPrompt: string; description: string; preview: string }> = {
    'qa': {
      label: 'Q&A skeleton',
      defaultPrompt: 'You are a helpful assistant.',
      description: 'Each chunk → user message. Leave assistant blank to fill in your answers.',
      preview: '{"messages":[{"role":"system","content":"…"},{"role":"user","content":"<chunk>"},{"role":"assistant","content":""}]}',
    },
    'context-answer': {
      label: 'Context-answer',
      defaultPrompt: 'Answer the question based only on the provided context.',
      description: 'Each chunk → system context. Leave user message blank — fill in questions later.',
      preview: '{"messages":[{"role":"system","content":"Context:\\n<chunk>"},{"role":"user","content":""},{"role":"assistant","content":""}]}',
    },
    'instruct': {
      label: 'Instruction',
      defaultPrompt: 'Summarize the following passage.',
      description: 'Alpaca-style. System prompt = instruction field, chunk = input field.',
      preview: '{"instruction":"<system prompt>","input":"<chunk>","output":""}',
    },
  };

  const templateIds: ImportTemplate[] = ['qa', 'context-answer', 'instruct'];

  // ── State ─────────────────────────────────────────────────────────────────

  let template: ImportTemplate = $state('qa');
  let systemPrompt = $state(templateDefs['qa'].defaultPrompt);
  let chunkSize = $state(512);
  let isDragging = $state(false);
  let isProcessing = $state(false);
  let processingMsg = $state('');
  let errorMsg = $state('');
  let loadedFiles: { name: string; text: string }[] = $state([]);
  let userEditedPrompt = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();

  let info = $derived(formatInfo[exportFormat]);
  let currentDef = $derived(templateDefs[template]);
  const ACCEPT_ALL = '.txt,.md,.markdown,.docx,.pdf,.csv,.xlsx,.xls,.json,.jsonl,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,text/plain,text/markdown,text/csv,application/json,application/jsonl,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/*';
  let acceptString = $derived(ACCEPT_ALL);

  function pickTemplate(id: ImportTemplate) {
    template = id;
    if (!userEditedPrompt) {
      systemPrompt = templateDefs[id].defaultPrompt;
    }
  }

  // ── Format-specific output builders ──────────────────────────────────────

  function buildOutput(text: string): string {
    if (exportFormat === 'jsonl' || exportFormat === 'alpaca' || exportFormat === 'sharegpt') {
      // Conversational JSONL — uses templates
      const tmpl: ImportTemplate = exportFormat === 'alpaca' ? 'instruct'
        : exportFormat === 'sharegpt' ? 'qa'
        : template;
      return fileToConversationalJsonl(text, tmpl, systemPrompt, chunkSize);
    }

    // Document formats (json/csv/md/txt/parquet): emit chunk-JSONL into the editor.
    // ConvertTab.buildExportContent detects this shape and renders the target format
    // on download, so the toolbar's per-format settings still apply.
    const chunks = chunkText(text, 'fixed', { maxTokens: chunkSize, overlap: 0 })
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
    const results: Array<{ jsonl: string; filename: string; rawSource: string }> = [];
    for (const f of loadedFiles) {
      const output = buildOutput(f.text);
      if (output.trim()) results.push({ jsonl: output, filename: f.name, rawSource: f.text });
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

  <!-- JSONL-only: template picker + preview + system prompt -->
  {#if info.showTemplates}
    <div class="options-row">
      <span class="row-label">Template:</span>
      <div class="template-buttons">
        {#each templateIds as id}
          <button
            class="template-btn"
            class:active={template === id}
            onclick={() => pickTemplate(id)}
            title={templateDefs[id].description}
          >{templateDefs[id].label}</button>
        {/each}
      </div>
      <span class="template-desc">{currentDef.description}</span>
    </div>

    <div class="preview-row">
      <span class="row-label">Output:</span>
      <code class="preview-code">{currentDef.preview}</code>
    </div>

    <div class="prompt-row">
      <span class="row-label">System prompt:</span>
      <input
        type="text"
        class="prompt-input"
        bind:value={systemPrompt}
        oninput={() => { userEditedPrompt = true; }}
        placeholder={currentDef.defaultPrompt}
      />
      {#if userEditedPrompt}
        <button class="reset-btn" onclick={() => { systemPrompt = currentDef.defaultPrompt; userEditedPrompt = false; }} title="Reset to default">↺</button>
      {/if}
    </div>
  {/if}

  <!-- Chunk size + generate -->
  <div class="controls-row">
    {#if info.showChunkSize}
      <span class="row-label">Chunk size:</span>
      <input type="range" min="128" max="2048" step="64" bind:value={chunkSize} class="slider" aria-label="Chunk size in tokens" />
      <span class="chunk-val">{chunkSize}t</span>
    {/if}
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

  :global(.import-panel .options-row),
  :global(.import-panel .preview-row),
  :global(.import-panel .prompt-row),
  :global(.import-panel .controls-row) {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  :global(.import-panel .row-label) {
    color: var(--ink-dim);
    white-space: nowrap;
    min-width: 90px;
  }

  :global(.import-panel .template-buttons) { display: flex; gap: 4px; flex-shrink: 0; }
  :global(.import-panel .template-btn) {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink-dim);
    font-family: inherit;
    font-size: 12px;
    padding: 2px 8px;
    cursor: pointer;
    white-space: nowrap;
  }
  :global(.import-panel .template-btn:hover) { color: var(--ink); border-color: var(--ink-dim); }
  :global(.import-panel .template-btn.active) { color: var(--accent); border-color: var(--accent); background: rgba(224, 168, 78, 0.07); }
  :global(.import-panel .template-desc) { color: var(--ink-dim); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }

  :global(.import-panel .preview-code) {
    font-family: inherit;
    font-size: 11px;
    color: var(--syntax-str);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 2px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  :global(.import-panel .prompt-input) {
    flex: 1;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 7px;
    outline: none;
  }
  :global(.import-panel .prompt-input:focus) { border-color: var(--accent); }
  :global(.import-panel .prompt-input::placeholder) { color: var(--muted); font-style: italic; }
  :global(.import-panel .reset-btn) {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--ink-dim);
    font-size: 14px;
    padding: 0 3px;
    line-height: 1;
  }
  :global(.import-panel .reset-btn:hover) { color: var(--ink); }

  :global(.import-panel .slider) {
    -webkit-appearance: none;
    appearance: none;
    width: 130px;
    height: 12px;
    background: transparent;
    outline: none;
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    margin: 0;
  }
  :global(.import-panel .slider::-webkit-slider-runnable-track) {
    height: 1px;
    background: var(--accent);
    border: none;
  }
  :global(.import-panel .slider::-webkit-slider-thumb) {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -5.5px;
    background: transparent url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><text x='6' y='10' text-anchor='middle' font-size='14' font-family='monospace' fill='%23e0a84e'>*</text></svg>") no-repeat center;
    background-size: 12px 12px;
    border: none;
    cursor: pointer;
  }
  :global(.import-panel .slider::-moz-range-track) {
    height: 1px;
    background: var(--accent);
    border: none;
  }
  :global(.import-panel .slider::-moz-range-thumb) {
    width: 12px;
    height: 12px;
    background: transparent url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><text x='6' y='10' text-anchor='middle' font-size='14' font-family='monospace' fill='%23e0a84e'>*</text></svg>") no-repeat center;
    background-size: 12px 12px;
    border: none;
    border-radius: 0;
    cursor: pointer;
  }
  :global(.import-panel .chunk-val) { color: var(--accent); font-weight: 500; min-width: 36px; flex-shrink: 0; }
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
