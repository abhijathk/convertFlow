<script lang="ts">
  import { fileToConversationalJsonl, fileToConversationalJsonlMulti } from '../lib/convert-import';
  import { chunkText } from '../lib/chunk';
  import type { ImportTemplate, PromptRotationMode } from '../lib/convert-import';
  import type { ExportFormat } from '../stores/convertState';
  import { extractPdfText, extractPdfTextWithOcr } from '../lib/pdf-loader';
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
      promptPools?: Partial<Record<ImportTemplate, string[]>>;
      promptMode?: PromptRotationMode;
      promptSeed?: number;
    }>) => void;
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

  // ── Multi-prompt state ────────────────────────────────────────────────────

  let confirmingAdvanced = $state(false);
  let advancedDialogOpen = $state(false);
  let multiPromptEnabled = $state(false);
  let multiPromptMode = $state<PromptRotationMode>('round-robin');
  let multiPromptSeed = $state(42);

  // For round-robin and random
  let multiPrompts = $state<string[]>([]);
  // For pool-by-template — three separate lists
  let poolQa = $state<string[]>([]);
  let poolContext = $state<string[]>([]);
  let poolInstruct = $state<string[]>([]);

  function poolFor(t: ImportTemplate): string[] {
    if (t === 'qa') return poolQa;
    if (t === 'context-answer') return poolContext;
    return poolInstruct;
  }
  function setPool(t: ImportTemplate, list: string[]) {
    if (t === 'qa') poolQa = list;
    else if (t === 'context-answer') poolContext = list;
    else poolInstruct = list;
  }

  function openAdvancedWarning() { confirmingAdvanced = true; }
  function dismissAdvancedWarning() { confirmingAdvanced = false; }
  function acceptAdvancedWarning() {
    confirmingAdvanced = false;
    // Seed sensible defaults the first time
    if (multiPrompts.length === 0) multiPrompts = [systemPrompt, ''];
    if (poolQa.length === 0) poolQa = ['You are a helpful assistant.', ''];
    if (poolContext.length === 0) poolContext = ['Answer the question based only on the provided context.', ''];
    if (poolInstruct.length === 0) poolInstruct = ['Summarize the following passage.', ''];
    advancedDialogOpen = true;
  }
  function closeAdvancedDialog() { advancedDialogOpen = false; }

  function saveAdvanced() {
    // Trim + drop empty rows
    const trim = (a: string[]) => a.map(p => p.trim()).filter(p => p.length > 0);
    if (multiPromptMode === 'pool-by-template') {
      poolQa = trim(poolQa);
      poolContext = trim(poolContext);
      poolInstruct = trim(poolInstruct);
      const valid = (poolQa.length >= 2 || poolContext.length >= 2 || poolInstruct.length >= 2);
      multiPromptEnabled = valid;
    } else {
      multiPrompts = trim(multiPrompts);
      multiPromptEnabled = multiPrompts.length >= 2;
    }
    advancedDialogOpen = false;
  }

  function disableMultiPrompt() { multiPromptEnabled = false; }
  function addPromptRow() { multiPrompts = [...multiPrompts, '']; }
  function removePromptRow(i: number) { multiPrompts = multiPrompts.filter((_, j) => j !== i); }
  function addPoolRow(t: ImportTemplate) { setPool(t, [...poolFor(t), '']); }
  function removePoolRow(t: ImportTemplate, i: number) { setPool(t, poolFor(t).filter((_, j) => j !== i)); }
  function updatePoolRow(t: ImportTemplate, i: number, v: string) {
    const next = [...poolFor(t)];
    next[i] = v;
    setPool(t, next);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

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
      const tmpl: ImportTemplate = exportFormat === 'alpaca' ? 'instruct'
        : exportFormat === 'sharegpt' ? 'qa'
        : template;

      if (multiPromptEnabled && exportFormat === 'jsonl') {
        return fileToConversationalJsonlMulti(text, tmpl, {
          mode: multiPromptMode,
          seed: multiPromptSeed,
          prompts: multiPromptMode === 'pool-by-template' ? undefined : multiPrompts,
          promptPools: multiPromptMode === 'pool-by-template'
            ? { 'qa': poolQa, 'context-answer': poolContext, 'instruct': poolInstruct }
            : undefined,
        }, chunkSize);
      }
      return fileToConversationalJsonl(text, tmpl, systemPrompt, chunkSize);
    }

    // Document formats (json/csv/md/txt/parquet)
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
    const results: Array<{
      jsonl: string;
      filename: string;
      rawSource: string;
      template?: ImportTemplate;
      systemPrompt?: string;
      chunkSize?: number;
      prompts?: string[];
      promptPools?: Partial<Record<ImportTemplate, string[]>>;
      promptMode?: PromptRotationMode;
      promptSeed?: number;
    }> = [];

    for (const f of loadedFiles) {
      try {
        const output = buildOutput(f.text);
        if (output.trim()) results.push({
          jsonl: output,
          filename: f.name,
          rawSource: f.text,
          template,
          systemPrompt,
          chunkSize,
          ...(multiPromptEnabled ? {
            prompts: multiPromptMode === 'pool-by-template' ? undefined : multiPrompts,
            promptPools: multiPromptMode === 'pool-by-template'
              ? { 'qa': poolQa, 'context-answer': poolContext, 'instruct': poolInstruct }
              : undefined,
            promptMode: multiPromptMode,
            promptSeed: multiPromptSeed,
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
        disabled={multiPromptEnabled}
        title={multiPromptEnabled ? 'Disabled while multi-prompt is on' : undefined}
      />
      {#if userEditedPrompt && !multiPromptEnabled}
        <button class="reset-btn" onclick={() => { systemPrompt = currentDef.defaultPrompt; userEditedPrompt = false; }} title="Reset to default">↺</button>
      {/if}
    </div>

    <!-- Multi-prompt trigger row -->
    <div class="advanced-row">
      {#if multiPromptEnabled}
        <span class="advanced-label">multi-prompt:</span>
        <span class="multi-prompt-summary">
          {multiPromptMode === 'pool-by-template'
            ? `pools: qa ${poolQa.length} · ctx ${poolContext.length} · inst ${poolInstruct.length}`
            : `${multiPrompts.length} prompts · ${multiPromptMode}${multiPromptMode === 'random' ? ` (seed ${multiPromptSeed})` : ''}`}
        </span>
        <button type="button" class="advanced-btn" onclick={() => (advancedDialogOpen = true)}>edit…</button>
        <button type="button" class="advanced-btn off" onclick={disableMultiPrompt}>disable</button>
      {:else}
        <button type="button" class="advanced-btn" onclick={openAdvancedWarning}>
          <span class="advanced-icon" aria-hidden="true">⚙</span>
          advanced: use multiple system prompts
        </button>
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

<!-- Warning dialog — rendered outside .import-panel so it escapes the stacking context -->
{#if confirmingAdvanced}
  <div class="advanced-overlay" role="dialog" aria-modal="true" aria-labelledby="adv-warn-title">
    <div class="advanced-box">
      <p class="advanced-title" id="adv-warn-title">Advanced: multiple system prompts</p>
      <p class="advanced-sub">
        Multi-prompt mode rotates several system prompts across the generated records. It's useful for
        a few specific situations — and the wrong choice for most fine-tunes.
      </p>
      <ul class="advanced-sub-list">
        <li><strong>Use it for:</strong> instruction-following / multi-task fine-tunes, prompt-phrasing robustness training, or RAG datasets where you want varied wrapping phrases.</li>
        <li><strong>Don't use it for:</strong> single-task fine-tunes (chatbot persona, summariser, classifier). Vary the prompt and the model will learn to be inconsistent.</li>
        <li>You can disable it again at any time without losing your single prompt.</li>
      </ul>
      <div class="advanced-actions">
        <button class="advanced-confirm-btn danger" onclick={acceptAdvancedWarning}>I understand — continue</button>
        <button class="advanced-confirm-btn" onclick={dismissAdvancedWarning}>cancel</button>
      </div>
    </div>
  </div>
{/if}

<!-- Settings dialog -->
{#if advancedDialogOpen}
  <div class="advanced-overlay" role="dialog" aria-modal="true" aria-labelledby="adv-dlg-title">
    <div class="advanced-box advanced-box-wide">
      <p class="advanced-title" id="adv-dlg-title">Multi-prompt settings</p>
      <p class="advanced-sub">Each generated record will get one system prompt selected by the mode you choose. Add at least 2 prompts. Empty rows are dropped on save.</p>

      <div class="advanced-field-row">
        <span class="advanced-field-label">Mode:</span>
        <label class="advanced-radio">
          <input type="radio" bind:group={multiPromptMode} value="round-robin" />
          round-robin — cycle 1 → 2 → 3 → 1…
        </label>
        <label class="advanced-radio">
          <input type="radio" bind:group={multiPromptMode} value="random" />
          random (seeded, reproducible)
        </label>
        <label class="advanced-radio">
          <input type="radio" bind:group={multiPromptMode} value="pool-by-template" />
          pool by template (separate prompts per Q&A / context-answer / instruct)
        </label>
      </div>

      {#if multiPromptMode === 'random'}
        <div class="advanced-field-row">
          <span class="advanced-field-label">Seed:</span>
          <input
            type="number"
            class="advanced-seed-input"
            bind:value={multiPromptSeed}
            min="0"
            max="2147483647"
            aria-label="Random seed"
          />
          <span class="advanced-hint">Same seed + same prompts → same assignments.</span>
        </div>
      {/if}

      {#if multiPromptMode === 'pool-by-template'}
        {#each (['qa', 'context-answer', 'instruct'] as ImportTemplate[]) as tpl (tpl)}
          <div class="advanced-pool-group">
            <span class="advanced-field-label">{tpl}:</span>
            {#each poolFor(tpl) as p, i (i)}
              <div class="advanced-prompt-row">
                <span class="advanced-prompt-index">{i + 1}</span>
                <textarea
                  class="advanced-prompt-input"
                  value={p}
                  oninput={(e) => updatePoolRow(tpl, i, (e.target as HTMLTextAreaElement).value)}
                  placeholder="Prompt {i + 1} for {tpl}"
                  rows="2"
                ></textarea>
                <button
                  type="button"
                  class="advanced-prompt-remove"
                  onclick={() => removePoolRow(tpl, i)}
                  disabled={poolFor(tpl).length <= 1}
                  aria-label="Remove prompt {i + 1}"
                >×</button>
              </div>
            {/each}
            <button type="button" class="advanced-prompt-add" onclick={() => addPoolRow(tpl)}>+ add prompt for {tpl}</button>
          </div>
        {/each}
      {:else}
        <div class="advanced-prompts">
          <span class="advanced-field-label">Prompts:</span>
          {#each multiPrompts as _, i (i)}
            <div class="advanced-prompt-row">
              <span class="advanced-prompt-index">{i + 1}</span>
              <textarea
                class="advanced-prompt-input"
                bind:value={multiPrompts[i]}
                placeholder="System prompt {i + 1}"
                rows="2"
              ></textarea>
              <button
                type="button"
                class="advanced-prompt-remove"
                onclick={() => removePromptRow(i)}
                disabled={multiPrompts.length <= 1}
                aria-label="Remove prompt {i + 1}"
              >×</button>
            </div>
          {/each}
          <button type="button" class="advanced-prompt-add" onclick={addPromptRow}>+ add prompt</button>
        </div>
      {/if}

      <div class="advanced-actions">
        <button class="advanced-confirm-btn danger" onclick={saveAdvanced}>save</button>
        <button class="advanced-confirm-btn" onclick={closeAdvancedDialog}>cancel</button>
      </div>
    </div>
  </div>
{/if}

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
  :global(.import-panel .prompt-input:disabled) { opacity: 0.4; cursor: not-allowed; }
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

  /* ── Advanced / multi-prompt UI ─────────────────────────────────────────── */

  :global(.import-panel .advanced-row) {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 2px;
  }
  :global(.import-panel .advanced-label) {
    font-size: 11px;
    color: var(--ink-dim);
    letter-spacing: 0.04em;
  }
  :global(.import-panel .multi-prompt-summary) {
    font-size: 11px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-radius: 3px;
    padding: 2px 8px;
  }
  :global(.import-panel .advanced-btn) {
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    color: var(--accent);
    border-radius: 3px;
    padding: 3px 9px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  :global(.import-panel .advanced-btn:hover) { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  :global(.import-panel .advanced-btn.off) { color: var(--ink-dim); border-color: var(--border); }
  :global(.import-panel .advanced-btn.off:hover) { color: var(--ink); }
  :global(.import-panel .advanced-icon) { margin-right: 4px; }

  /* Dialogs — fixed overlay, NOT scoped under .import-panel */
  :global(.advanced-overlay) {
    position: fixed;
    inset: 0;
    z-index: 600;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.advanced-box) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 22px 26px;
    width: calc(100vw - 32px);
    max-width: 480px;
    max-height: 85vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  :global(.advanced-box-wide) { max-width: 640px; }
  :global(.advanced-title) { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0; }
  :global(.advanced-sub) { font-size: 12px; color: var(--ink-dim); line-height: 1.5; margin: 0; }
  :global(.advanced-sub-list) { font-size: 12px; color: var(--ink-dim); line-height: 1.5; margin: 0; padding-left: 18px; }
  :global(.advanced-hint) { font-size: 11px; color: var(--muted); }

  :global(.advanced-actions) { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  :global(.advanced-confirm-btn) {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 14px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
  }
  :global(.advanced-confirm-btn:hover) { color: var(--ink); border-color: var(--ink-dim); }
  :global(.advanced-confirm-btn.danger) { color: var(--err); border-color: var(--err); }
  :global(.advanced-confirm-btn.danger:hover) { background: color-mix(in srgb, var(--err) 12%, transparent); }

  :global(.advanced-field-row) { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  :global(.advanced-field-label) {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    min-width: 70px;
  }
  :global(.advanced-radio) {
    font-size: 12px;
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
  :global(.advanced-seed-input) {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    width: 130px;
  }

  :global(.advanced-prompts),
  :global(.advanced-pool-group) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }
  :global(.advanced-pool-group:first-of-type) { border-top: none; padding-top: 0; }
  :global(.advanced-prompt-row) { display: flex; align-items: flex-start; gap: 6px; }
  :global(.advanced-prompt-index) { font-size: 11px; color: var(--ink-dim); width: 16px; text-align: right; padding-top: 6px; }
  :global(.advanced-prompt-input) {
    flex: 1;
    min-height: 38px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 8px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    resize: vertical;
  }
  :global(.advanced-prompt-input:focus) { border-color: var(--accent); outline: none; }
  :global(.advanced-prompt-remove) {
    background: none;
    border: none;
    color: var(--ink-dim);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 3px;
  }
  :global(.advanced-prompt-remove:hover:not(:disabled)) { color: var(--err); background: color-mix(in srgb, var(--err) 10%, transparent); }
  :global(.advanced-prompt-remove:disabled) { opacity: 0.3; cursor: not-allowed; }
  :global(.advanced-prompt-add) {
    align-self: flex-start;
    margin-top: 4px;
    background: none;
    border: 1px dashed var(--border);
    border-radius: 3px;
    padding: 4px 12px;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    cursor: pointer;
  }
  :global(.advanced-prompt-add:hover) { color: var(--accent); border-color: var(--accent); }
</style>
