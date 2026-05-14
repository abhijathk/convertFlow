<script lang="ts" context="module">
  let untitledCounter = 0;
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { editorState, hydrateEditorState, openFile, closeFile, selectFile, updateFileContent, toggleSplitPane, setSplitPaneFormat, toggleSplitPaneOrientation, toggleBottomPanel, setBottomPanelTab, splitPaneInitialPreview, pendingJump, setFileReadOnly, editorSelection } from '../stores/editorState';
  import { get } from 'svelte/store';
  import { registerThemes } from '../lib/monaco-theme';
  import { appSettings } from '../stores/appSettings';
  import { parseFile, isSupported } from '../lib/file-parse';
  import { buildExportContent, type ExportFormat } from '../lib/format-convert';
  import { convertState } from '../stores/convertState';
  import { sortLines, dedupeLines, trimTrailingWhitespace, normalizeUnicode, convertCase } from '../lib/text-toolkit';
  import { setTab, sendToChunk, sendToConvert } from '../stores/shellState';
  import { selectedUtilityId } from '../stores/utilitiesState';
  import { validateJsonl } from '../lib/validate';
  import { approximateTokens } from '../lib/tokenize';
  import presetsData from '../data/presets.json';
  import CsvTableView from './CsvTableView.svelte';
  import EditorFormatBar from './EditorFormatBar.svelte';

  // Monaco — lazy loaded
  let monaco: typeof import('monaco-editor') | null = $state(null);
  let editorContainer: HTMLDivElement | undefined = $state();
  let previewContainer: HTMLDivElement | undefined = $state();
  let diffContainer: HTMLDivElement | undefined = $state();
  let mainEditor: import('monaco-editor').editor.IStandaloneCodeEditor | null = $state(null);
  let previewEditor: import('monaco-editor').editor.IStandaloneCodeEditor | null = $state(null);
  let diffEditor: import('monaco-editor').editor.IStandaloneDiffEditor | null = $state(null);
  let modelMap = new Map<string, import('monaco-editor').editor.ITextModel>();

  let csvPreviewContent = $state('');
  let diffMode = $state(false);

  let dragOver = $state(false);
  let actionMenuOpen = $state(false);
  let saveMenuOpen = $state(false);
  let parseStatus = $state('');
  let toastMsg = $state<{ message: string; undo?: () => void } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmingClose = $state<string | null>(null);
  let fileInputRef: HTMLInputElement | undefined = $state();

  let activeFile = $derived($editorState.openFiles.find(f => f.id === $editorState.activeFileId) ?? null);
  let isEmpty = $derived($editorState.openFiles.length === 0);
  let totalChars = $derived($editorState.openFiles.reduce((sum, f) => sum + f.content.length, 0));

  // ── Task 2: Linter state ──────────────────────────────────────────────────
  const lintPreset = presetsData[0];
  let lintProblems = $state<import('../lib/validate').ValidationError[]>([]);
  let lintTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Task 3: Find & Replace state ─────────────────────────────────────────
  interface FindMatch { fileId: string; fileName: string; line: number; lineText: string; matchStart: number; matchEnd: number; }
  let findSearch = $state('');
  let findReplace = $state('');
  let findMatchCase = $state(false);
  let findUseRegex = $state(false);
  let findMatches = $state<FindMatch[]>([]);
  let findTruncated = $state(false);
  let findSearchTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Task 4: Token gutter state ────────────────────────────────────────────
  const TOKEN_GUTTER_KEY = 'dataprep:token-gutter';
  let showTokenGutter = $state((() => { try { return localStorage.getItem(TOKEN_GUTTER_KEY) === 'true'; } catch { return false; } })());
  let tokenDecorations = $state<string[]>([]);
  let tokenTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Task 5: Format-on-paste state ────────────────────────────────────────
  let pasteToastMsg = $state('');
  let pasteToastTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingPasteExpand: (() => void) | null = null;

  const BADGE_MAP: Record<string, string> = {
    jsonl: 'JSONL', json: 'JSON', md: 'MD', markdown: 'MD',
    csv: 'CSV', txt: 'TXT', pdf: 'PDF',
    png: 'IMG', jpg: 'IMG', jpeg: 'IMG', webp: 'IMG',
    xlsx: 'XLSX', xls: 'XLSX', docx: 'DOCX',
  };
  let activeFileExt = $derived((activeFile?.name ?? '').split('.').pop()?.toLowerCase() ?? '');
  let activeFormatBadge = $derived(activeFileExt ? (BADGE_MAP[activeFileExt] ?? activeFileExt.toUpperCase()) : '');

  // Derive the native format of the active file so we can hide it from the split pane format selector
  type SplitFormat = 'jsonl' | 'csv' | 'json' | 'md' | 'txt' | 'alpaca' | 'sharegpt';
  const SPLIT_FORMATS: { value: SplitFormat; label: string }[] = [
    { value: 'jsonl',    label: 'JSONL' },
    { value: 'csv',      label: 'CSV' },
    { value: 'json',     label: 'JSON' },
    { value: 'md',       label: 'Markdown' },
    { value: 'txt',      label: 'TXT' },
    { value: 'alpaca',   label: 'Alpaca' },
    { value: 'sharegpt', label: 'ShareGPT' },
  ];
  let nativeFormat = $derived((): SplitFormat | null => {
    const ext = (activeFile?.name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'md' || ext === 'markdown') return 'md';
    if (ext === 'csv') return 'csv';
    if (ext === 'json') return 'json';
    if (ext === 'jsonl') return 'jsonl';
    if (ext === 'txt') return 'txt';
    return null;
  });
  let availableSplitFormats = $derived(SPLIT_FORMATS.filter(f => f.value !== nativeFormat()));

  // ── Lifecycle ──────────────────────────────────────────────────────────
  onMount(async () => {
    hydrateEditorState();
    await loadMonaco();
  });

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
    mainEditor?.dispose();
    previewEditor?.dispose();
    diffEditor?.dispose();
    modelMap.forEach(m => m.dispose());
    modelMap.clear();
  });

  async function loadMonaco() {
    // Configure Monaco workers BEFORE importing the editor.
    // We only use json + the base editor worker (per astro.config.mjs whitelist).
    if (typeof self !== 'undefined' && !(self as any).MonacoEnvironment) {
      const editorWorker = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
      const jsonWorker = await import('monaco-editor/esm/vs/language/json/json.worker?worker');
      (self as any).MonacoEnvironment = {
        getWorker(_moduleId: string, label: string) {
          if (label === 'json') return new jsonWorker.default();
          return new editorWorker.default();
        },
      };
    }
    const m = await import('monaco-editor');
    registerThemes(m);
    monaco = m;
  }

  // Mount Monaco when both monaco library + editorContainer are ready.
  // Also dispose the editor when its container unmounts (all files closed),
  // so re-uploading after closing all files re-creates Monaco in the new container.
  $effect(() => {
    if (monaco && editorContainer && !mainEditor) {
      mountMainEditor();
    } else if (!editorContainer && mainEditor) {
      mainEditor.dispose();
      mainEditor = null;
      modelMap.forEach(m => m.dispose());
      modelMap.clear();
    }
  });

  function mountMainEditor() {
    if (!monaco || !editorContainer || mainEditor) return;
    mainEditor = monaco.editor.create(editorContainer, {
      value: '',
      language: 'json',
      theme: $appSettings.syntaxTheme,
      automaticLayout: true,
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
      fontSize: 14,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      lineNumbersMinChars: 3,
      tabSize: 2,
      wordWrap: 'on',
    });

    mainEditor.onDidChangeModelContent(() => {
      const f = activeFile;
      if (!f) return;
      const content = mainEditor!.getValue();
      // Skip if content matches the model (avoid feedback loop on switch)
      if (f.content === content) return;
      updateFileContent(f.id, content);
      schedulePreviewUpdate();
    });

    mainEditor.onDidChangeCursorSelection(() => {
      const f = activeFile;
      const sel = mainEditor?.getSelection();
      const model = mainEditor?.getModel();
      if (!f || !sel || !model || sel.isEmpty()) {
        editorSelection.set(null);
        return;
      }
      editorSelection.set({ fileId: f.id, text: model.getValueInRange(sel) });
    });

    // Task 5: Format-on-paste — JSON array → JSONL
    mainEditor.onDidPaste((e) => {
      const model = mainEditor!.getModel();
      if (!model) return;
      const pastedText = model.getValueInRange(e.range).trim();
      if (!pastedText.startsWith('[') || !pastedText.endsWith(']')) return;
      let arr: unknown[];
      try {
        const parsed = JSON.parse(pastedText);
        if (!Array.isArray(parsed) || parsed.length < 2) return;
        if (!parsed.every(el => el !== null && typeof el === 'object' && !Array.isArray(el))) return;
        arr = parsed;
      } catch { return; }
      const expand = () => {
        const before = mainEditor!.getValue();
        const jsonl = (arr as Record<string, unknown>[]).map(o => JSON.stringify(o)).join('\n');
        mainEditor!.executeEdits('format-on-paste', [{
          range: e.range,
          text: jsonl,
        }]);
        mainEditor!.focus();
        pasteToastMsg = '';
        showToast(`✓ expanded to JSONL (${arr.length} items)`, () => mainEditor!.setValue(before));
      };
      pendingPasteExpand = expand;
      pasteToastMsg = `Pasted JSON array (${arr.length} items). Expand to JSONL?`;
      if (pasteToastTimer) clearTimeout(pasteToastTimer);
      pasteToastTimer = setTimeout(() => { pasteToastMsg = ''; pendingPasteExpand = null; }, 6000);
    });

    // If a file was already active when Monaco mounted, switch to it now
    if ($editorState.activeFileId) {
      switchActiveModel($editorState.activeFileId);
    }
  }

  function ensurePreviewEditor() {
    if (!monaco || !previewContainer || previewEditor) return;
    previewEditor = monaco.editor.create(previewContainer, {
      value: '',
      language: $editorState.splitPaneFormat === 'json' ? 'json' : 'plaintext',
      theme: $appSettings.syntaxTheme,
      automaticLayout: true,
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
      fontSize: 14,
      minimap: { enabled: false },
      readOnly: true,
      scrollBeyondLastLine: false,
      lineNumbersMinChars: 3,
      wordWrap: 'on',
    });
    // Immediately populate so the right pane is never blank on open
    updatePreview();
  }

  function ensureDiffEditor() {
    if (!monaco || !diffContainer || diffEditor) return;
    diffEditor = monaco.editor.createDiffEditor(diffContainer, {
      theme: $appSettings.syntaxTheme,
      automaticLayout: true,
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
      fontSize: 14,
      readOnly: true,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      renderSideBySide: true,
    });
    updateDiff();
  }

  function disposeDiffEditor() {
    if (diffEditor) { diffEditor.dispose(); diffEditor = null; }
  }

  function updateDiff() {
    if (!diffEditor || !monaco || !activeFile) return;
    try {
      const fmt = $editorState.splitPaneFormat as ExportFormat;
      const source = fmt === 'jsonl' ? activeFile.content : toJsonlIfNeeded(activeFile.content);
      const generated = buildExportContent(source, fmt, $convertState.formatSettings);
      const lang = fmt === 'json' || fmt === 'jsonl' ? 'json' : 'plaintext';
      const originalModel = monaco.editor.createModel(activeFile.content, lang);
      const modifiedModel = monaco.editor.createModel(generated, lang);
      const prev = diffEditor.getModel();
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });
      prev?.original.dispose();
      prev?.modified.dispose();
    } catch {
      // ignore diff errors silently
    }
  }

  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  function schedulePreviewUpdate() {
    if (!$editorState.splitPaneOpen) return;
    splitPaneInitialPreview.set(null); // user is editing — switch to live preview
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (diffMode) updateDiff(); else updatePreview();
    }, 150);
  }

  // For non-JSONL source content (e.g. MD text in left panel), formats like Alpaca and
  // ShareGPT expect JSONL input. Pass through JSONL as intermediate step so all formats
  // produce output regardless of what's on the left panel.
  function toJsonlIfNeeded(content: string): string {
    const sample = content.split('\n').filter(l => l.trim()).slice(0, 3);
    const isJsonl = sample.length > 0 && sample.every(l => {
      try { const o = JSON.parse(l); return typeof o === 'object' && o !== null; } catch { return false; }
    });
    return isJsonl ? content : buildExportContent(content, 'jsonl', $convertState.formatSettings);
  }

  function updateCsvPreview() {
    if (!activeFile) return;
    try {
      csvPreviewContent = buildExportContent(toJsonlIfNeeded(activeFile.content), 'csv', $convertState.formatSettings);
    } catch { csvPreviewContent = ''; }
  }

  function updatePreview() {
    // If a pre-computed initial preview is active for this file+format, skip live path.
    // The reactive $effect below handles populating the right panel.
    const initial = get(splitPaneInitialPreview);
    if (initial !== null && activeFile?.id === initial.fileId && $editorState.splitPaneFormat === initial.format) {
      return;
    }

    if ($editorState.splitPaneFormat === 'csv') { updateCsvPreview(); return; }
    if (!previewEditor || !activeFile) return;
    try {
      const fmt = $editorState.splitPaneFormat as ExportFormat;
      // Non-JSONL sources (e.g. MD) go through JSONL intermediate so Alpaca/ShareGPT etc. work.
      const source = fmt === 'jsonl' ? activeFile.content : toJsonlIfNeeded(activeFile.content);
      const out = buildExportContent(source, fmt, $convertState.formatSettings);
      previewEditor.setValue(out);
      const lang = fmt === 'json' || fmt === 'jsonl' ? 'json' : 'plaintext';
      const model = previewEditor.getModel();
      if (model) monaco?.editor.setModelLanguage(model, lang);
    } catch (e) {
      previewEditor.setValue(`// preview error: ${String(e)}`);
    }
  }

  function switchActiveModel(fileId: string) {
    if (!monaco || !mainEditor) return;
    const file = $editorState.openFiles.find(f => f.id === fileId);
    if (!file) return;
    let model = modelMap.get(fileId);
    if (!model) {
      const lang = guessLanguage(file.name, file.content);
      model = monaco.editor.createModel(file.content, lang);
      modelMap.set(fileId, model);
    }
    mainEditor.setModel(model);
    mainEditor.updateOptions({ readOnly: file.readOnly ?? false });
    if (file.cursor) mainEditor.setPosition({ lineNumber: file.cursor.line, column: file.cursor.column });
    if (file.scroll) mainEditor.setScrollTop(file.scroll.top);
    if ($editorState.splitPaneOpen) {
      if (diffMode) updateDiff(); else updatePreview();
    }
  }

  function guessLanguage(name: string, content: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'json' || ext === 'jsonl') return 'json';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'css') return 'css';
    if (ext === 'html') return 'html';
    if (ext === 'js' || ext === 'mjs') return 'javascript';
    if (ext === 'ts') return 'typescript';
    if (ext === 'csv') return 'plaintext';
    // Detect JSON-ish content
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) return 'json';
    return 'plaintext';
  }

  // React to file/theme changes
  $effect(() => {
    if (!monaco || !mainEditor) return;
    if ($editorState.activeFileId) switchActiveModel($editorState.activeFileId);
  });

  $effect(() => {
    if (!monaco) return;
    monaco.editor.setTheme($appSettings.syntaxTheme);
  });

  $effect(() => {
    const opts = {
      wordWrap: ($appSettings.editorWordWrap ? 'on' : 'off') as 'on' | 'off',
      fontSize: $appSettings.editorFontSize,
      minimap: { enabled: $appSettings.editorMinimap },
    };
    mainEditor?.updateOptions(opts);
    previewEditor?.updateOptions(opts);
  });

  $effect(() => {
    if ($editorState.splitPaneOpen) {
      if ($editorState.splitPaneFormat === 'csv') {
        // CSV uses CsvTableView — dispose any existing Monaco preview or diff
        if (previewEditor) { previewEditor.dispose(); previewEditor = null; }
        disposeDiffEditor();
        if (diffMode) diffMode = false;
        updateCsvPreview();
      } else if (diffMode) {
        setTimeout(() => { ensureDiffEditor(); }, 0);
      } else {
        // Other formats use Monaco preview
        setTimeout(() => { ensurePreviewEditor(); updatePreview(); }, 0);
      }
    } else {
      if (previewEditor) { previewEditor.dispose(); previewEditor = null; }
      disposeDiffEditor();
    }
  });

  $effect(() => {
    void $editorState.splitPaneFormat;
    if ($editorState.splitPaneOpen) {
      if ($editorState.splitPaneFormat === 'csv') {
        // Switching TO csv — dispose Monaco preview and diff, show table
        if (previewEditor) { previewEditor.dispose(); previewEditor = null; }
        disposeDiffEditor();
        if (diffMode) diffMode = false;
        updateCsvPreview();
      } else if (diffMode) {
        // Switching between non-csv formats in diff mode — rebuild diff
        disposeDiffEditor();
        setTimeout(() => { ensureDiffEditor(); }, 0);
      } else {
        // Switching FROM csv or between non-csv formats — ensure Monaco is mounted
        setTimeout(() => { ensurePreviewEditor(); updatePreview(); }, 0);
      }
    }
  });

  // Task 2 (new): diff mode toggle — swap between preview and diff editor
  $effect(() => {
    if (!$editorState.splitPaneOpen || $editorState.splitPaneFormat === 'csv') {
      if (diffMode) diffMode = false;
      return;
    }
    if (diffMode) {
      // Entering diff mode: dispose preview, create diff editor
      if (previewEditor) { previewEditor.dispose(); previewEditor = null; }
      setTimeout(() => { ensureDiffEditor(); }, 0);
    } else {
      // Leaving diff mode: dispose diff editor, restore preview
      disposeDiffEditor();
      setTimeout(() => { ensurePreviewEditor(); updatePreview(); }, 0);
    }
  });

  // Task 2 (new): mount diff editor when diffContainer + monaco become available in diff mode
  $effect(() => {
    if (monaco && diffContainer && diffMode && $editorState.splitPaneOpen && $editorState.splitPaneFormat !== 'csv' && !diffEditor) {
      ensureDiffEditor();
    } else if (!diffContainer && diffEditor) {
      disposeDiffEditor();
    }
  });

  // Fallback: create preview editor as soon as previewContainer + monaco are both ready.
  // Handles page reload with persisted splitPaneOpen=true (effects fired while monaco was null).
  // Also disposes when the container unmounts (all files closed) so the next upload
  // creates a fresh editor in the new container instead of an orphan in the removed div.
  $effect(() => {
    if (monaco && previewContainer && $editorState.splitPaneOpen && $editorState.splitPaneFormat !== 'csv' && !previewEditor) {
      ensurePreviewEditor();
      updatePreview();
    } else if (!previewContainer && previewEditor) {
      previewEditor.dispose();
      previewEditor = null;
    }
  });

  // Populate right panel from pre-computed initial preview (from Convert/Chunk "Open in Editor").
  // Reactive on both $splitPaneInitialPreview AND previewEditor so it fires whenever EITHER
  // becomes available — handles the timing gap where the preview was set before the editor existed.
  $effect(() => {
    const initial = $splitPaneInitialPreview;
    if (!initial || activeFile?.id !== initial.fileId || $editorState.splitPaneFormat !== initial.format) return;
    if ($editorState.splitPaneFormat === 'csv') {
      csvPreviewContent = initial.content;
      return;
    }
    if (!previewEditor) return;
    previewEditor.setValue(initial.content);
    const lang = $editorState.splitPaneFormat === 'json' || $editorState.splitPaneFormat === 'jsonl'
      ? 'json'
      : 'plaintext';
    const model = previewEditor.getModel();
    if (model) monaco?.editor.setModelLanguage(model, lang);
  });

  // ── File operations ──────────────────────────────────────────────────────
  async function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const file of files) await openFromFile(file);
  }

  async function openFromFile(file: File) {
    if (!isSupported(file.name, { enableImages: false })) {
      showToast(`✗ ${file.name}: unsupported format`);
      return;
    }
    parseStatus = `loading ${file.name}…`;
    try {
      const text = await parseFile(file, { onProgress: (msg) => { parseStatus = msg; } });
      openFile(file.name, text);
      showToast(`✓ opened ${file.name}`);
    } catch (e) {
      showToast(`✗ ${file.name}: ${String(e)}`);
    } finally {
      parseStatus = '';
    }
  }

  function handleFileInput(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    for (const file of files) openFromFile(file);
    if (fileInputRef) fileInputRef.value = '';
  }

  function newFile() {
    openFile(`untitled-${++untitledCounter}.txt`, '');
  }

  function attemptCloseFile(id: string) {
    const file = $editorState.openFiles.find(f => f.id === id);
    if (file && file.dirty && file.content.trim().length > 0) {
      confirmingClose = id;
    } else {
      doCloseFile(id);
    }
  }

  function doCloseFile(id: string) {
    const model = modelMap.get(id);
    if (model) {
      model.dispose();
      modelMap.delete(id);
    }
    closeFile(id);
    confirmingClose = null;
  }

  // ── Action menu ──────────────────────────────────────────────────────────
  function applyTransform(transform: (text: string) => string, label: string) {
    if (!activeFile || !mainEditor) return;
    const before = activeFile.content;
    const newContent = transform(before);
    mainEditor.setValue(newContent);
    showToast(`✓ ${label}`, () => mainEditor!.setValue(before));
    actionMenuOpen = false;
  }

  function actionSort() { applyTransform(t => sortLines(t), 'sorted lines'); }
  function actionDedupe() {
    if (!activeFile || !mainEditor) return;
    const before = activeFile.content;
    const { result, removed } = dedupeLines(before, { trim: true });
    mainEditor.setValue(result);
    showToast(`✓ removed ${removed} duplicates`, () => mainEditor!.setValue(before));
    actionMenuOpen = false;
  }
  function actionTrim() {
    if (!activeFile || !mainEditor) return;
    const before = activeFile.content;
    const { result, trimmed } = trimTrailingWhitespace(before);
    mainEditor.setValue(result);
    showToast(`✓ trimmed ${trimmed} lines`, () => mainEditor!.setValue(before));
    actionMenuOpen = false;
  }
  function actionNormalize() {
    if (!activeFile || !mainEditor) return;
    const before = activeFile.content;
    const { result, replaced } = normalizeUnicode(before);
    mainEditor.setValue(result);
    showToast(`✓ normalized ${replaced} chars`, () => mainEditor!.setValue(before));
    actionMenuOpen = false;
  }
  function actionUpper() { applyTransform(t => convertCase(t, 'upper'), 'UPPERCASE'); }
  function actionLower() { applyTransform(t => convertCase(t, 'lower'), 'lowercase'); }

  function actionConvertTo(fmt: ExportFormat) {
    if (!activeFile || !mainEditor) return;
    const before = activeFile.content;
    try {
      const out = buildExportContent(before, fmt, $convertState.formatSettings);
      mainEditor.setValue(out);
      showToast(`✓ converted to ${fmt}`, () => mainEditor!.setValue(before));
    } catch (e) {
      showToast(`✗ convert failed: ${String(e)}`);
    }
    actionMenuOpen = false;
  }

  function actionLint() {
    setBottomPanelTab('linter');
    actionMenuOpen = false;
  }

  function sendToUtilities() {
    selectedUtilityId.set('token-estimator');
    setTab('utilities');
    actionMenuOpen = false;
  }

  // ── Send to other tabs ──────────────────────────────────────────────────
  function sendTo(tab: 'convert' | 'chunk') {
    if (!activeFile) return;
    if (tab === 'convert') {
      sendToConvert(activeFile.content);
      showToast(`✓ sent to Convert`);
    } else {
      sendToChunk(activeFile.content);
      showToast(`✓ sent to Chunk`);
    }
  }

  function triggerDownload(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ downloaded ${filename}`);
  }

  function downloadSourceFile() {
    if (!activeFile) return;
    saveMenuOpen = false;
    triggerDownload(activeFile.content, activeFile.name);
  }

  function downloadGeneratedFile() {
    if (!activeFile) return;
    saveMenuOpen = false;
    const fmt = $editorState.splitPaneFormat;
    const extMap: Record<string, string> = {
      jsonl: 'jsonl', csv: 'csv', json: 'json', md: 'md',
      txt: 'txt', alpaca: 'jsonl', sharegpt: 'jsonl',
    };
    const ext = extMap[fmt] ?? fmt;
    const baseName = activeFile.name.replace(/\.[^.]+$/, '');
    const filename = `${baseName}-${fmt}.${ext}`;
    const content = fmt === 'csv'
      ? csvPreviewContent
      : (previewEditor?.getValue() ?? '');
    if (!content.trim()) { showToast('nothing to save — right panel is empty'); return; }
    triggerDownload(content, filename);
  }

  function showToast(msg: string, undo?: () => void) {
    toastMsg = { message: msg, undo };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastMsg = null), undo ? 5000 : 2000);
  }

  function handleDragOver(e: DragEvent) { e.preventDefault(); dragOver = true; }
  function handleDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragOver = false;
  }

  function editorUndo() { mainEditor?.trigger('', 'undo', {}); mainEditor?.focus(); }
  function editorRedo() { mainEditor?.trigger('', 'redo', {}); mainEditor?.focus(); }

  // ── Task 1: pendingJump consumer ─────────────────────────────────────────
  $effect(() => {
    const intent = $pendingJump;
    if (!intent) return;
    const fileExists = $editorState.openFiles.some(f => f.id === intent.fileId);
    if (!fileExists) return;

    const doJump = () => {
      if (!mainEditor) { setTimeout(doJump, 50); return; }
      if ($editorState.activeFileId !== intent.fileId) {
        selectFile(intent.fileId);
        setTimeout(() => {
          mainEditor!.setPosition({ lineNumber: intent.line, column: intent.column ?? 1 });
          mainEditor!.revealLineInCenter(intent.line);
          pendingJump.set(null);
        }, 0);
      } else {
        mainEditor.setPosition({ lineNumber: intent.line, column: intent.column ?? 1 });
        mainEditor.revealLineInCenter(intent.line);
        pendingJump.set(null);
      }
    };

    setTimeout(doJump, 0);
  });

  // ── Task 2: Linter — debounced on active file content ────────────────────
  $effect(() => {
    const content = activeFile?.content ?? '';
    const ext = (activeFile?.name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (lintTimer) clearTimeout(lintTimer);
    if (ext === 'jsonl') {
      lintTimer = setTimeout(() => {
        lintProblems = validateJsonl(content, lintPreset as any);
      }, 200);
    } else if (ext === 'json') {
      lintTimer = setTimeout(() => {
        if (!content.trim()) { lintProblems = []; return; }
        try { JSON.parse(content); lintProblems = []; }
        catch (e) { lintProblems = [{ line: 0, code: 'invalid-json', field: '', message: `Invalid JSON: ${String(e)}`, suggestion: 'Check for missing commas, unmatched brackets, or trailing commas.' }]; }
      }, 200);
    } else if (ext === 'csv') {
      lintTimer = setTimeout(() => {
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length < 2) { lintProblems = []; return; }
        const expectedCols = lines[0].split(',').length;
        const problems: import('../lib/validate').ValidationError[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').length;
          if (cols !== expectedCols) {
            problems.push({ line: i + 1, code: 'csv-col-mismatch', field: '', message: `Row ${i + 1} has ${cols} columns, header has ${expectedCols}`, suggestion: 'Check for unquoted commas in field values.' });
          }
        }
        lintProblems = problems;
      }, 200);
    } else {
      lintProblems = [];
    }
    return () => { if (lintTimer) clearTimeout(lintTimer); };
  });

  // ── Task 3: Find — debounced search across all open files ────────────────
  $effect(() => {
    void findSearch; void findMatchCase; void findUseRegex; void $editorState.openFiles;
    if (findSearchTimer) clearTimeout(findSearchTimer);
    findSearchTimer = setTimeout(runFindSearch, 150);
    return () => { if (findSearchTimer) clearTimeout(findSearchTimer); };
  });

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function runFindSearch() {
    if (!findSearch.trim()) { findMatches = []; findTruncated = false; return; }
    const results: FindMatch[] = [];
    let truncated = false;
    let pattern: RegExp;
    try {
      const src = findUseRegex ? findSearch : escapeRegex(findSearch);
      pattern = new RegExp(src, findMatchCase ? 'g' : 'gi');
    } catch { findMatches = []; findTruncated = false; return; }

    for (const file of $editorState.openFiles) {
      const lines = file.content.split('\n');
      let fileCount = 0;
      for (let i = 0; i < lines.length && fileCount < 500; i++) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(lines[i])) !== null && fileCount < 500) {
          results.push({
            fileId: file.id,
            fileName: file.name,
            line: i + 1,
            lineText: lines[i],
            matchStart: m.index,
            matchEnd: m.index + m[0].length,
          });
          fileCount++;
          if (!pattern.global) break;
        }
      }
      if (fileCount >= 500) truncated = true;
    }
    findMatches = results;
    findTruncated = truncated;
  }

  function findJumpTo(match: FindMatch) {
    if ($editorState.activeFileId !== match.fileId) {
      selectFile(match.fileId);
      setTimeout(() => {
        mainEditor?.setPosition({ lineNumber: match.line, column: match.matchStart + 1 });
        mainEditor?.revealLineInCenter(match.line);
        mainEditor?.focus();
      }, 0);
    } else {
      mainEditor?.setPosition({ lineNumber: match.line, column: match.matchStart + 1 });
      mainEditor?.revealLineInCenter(match.line);
      mainEditor?.focus();
    }
  }

  function doReplaceOne(match: FindMatch) {
    const file = $editorState.openFiles.find(f => f.id === match.fileId);
    if (!file) return;
    const lines = file.content.split('\n');
    const lineIdx = match.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    let pattern: RegExp;
    try {
      const src = findUseRegex ? findSearch : escapeRegex(findSearch);
      pattern = new RegExp(src, findMatchCase ? '' : 'i');
    } catch { return; }
    lines[lineIdx] = line.replace(pattern, findReplace);
    updateFileContent(file.id, lines.join('\n'));
    if (mainEditor && $editorState.activeFileId === match.fileId) {
      const model = mainEditor.getModel();
      if (model) model.setValue(lines.join('\n'));
    }
    runFindSearch();
  }

  function doReplaceAllInFile(fileId: string) {
    const file = $editorState.openFiles.find(f => f.id === fileId);
    if (!file) return;
    let pattern: RegExp;
    try {
      const src = findUseRegex ? findSearch : escapeRegex(findSearch);
      pattern = new RegExp(src, findMatchCase ? 'g' : 'gi');
    } catch { return; }
    const newContent = file.content.replace(pattern, findReplace);
    updateFileContent(fileId, newContent);
    if (mainEditor && $editorState.activeFileId === fileId) {
      const model = mainEditor.getModel();
      if (model) model.setValue(newContent);
    }
    runFindSearch();
  }

  function doReplaceAll() {
    const fileIds = [...new Set(findMatches.map(m => m.fileId))];
    for (const id of fileIds) doReplaceAllInFile(id);
  }

  // ── Task 1 (new): Read-only toggle — sync Monaco readOnly with per-file flag ──
  $effect(() => {
    if (!mainEditor || !activeFile) return;
    mainEditor.updateOptions({ readOnly: activeFile.readOnly ?? false });
  });

  function toggleReadOnly() {
    if (!activeFile) return;
    setFileReadOnly(activeFile.id, !(activeFile.readOnly ?? false));
  }

  // ── Task 4: Token gutter ─────────────────────────────────────────────────
  $effect(() => {
    if (!showTokenGutter) {
      if (mainEditor && tokenDecorations.length > 0) {
        tokenDecorations = mainEditor.deltaDecorations(tokenDecorations, []);
      }
      return;
    }
    const content = activeFile?.content ?? '';
    const ext = (activeFile?.name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'jsonl' || !mainEditor) { return; }

    if (tokenTimer) clearTimeout(tokenTimer);
    tokenTimer = setTimeout(() => {
      if (!mainEditor) return;
      const lines = content.split('\n');
      const decorations: import('monaco-editor').editor.IModelDeltaDecoration[] = lines
        .map((line, idx) => {
          if (!line.trim()) return null;
          const count = approximateTokens(line);
          return {
            range: new (monaco!.Range)(idx + 1, line.length + 1, idx + 1, line.length + 1),
            options: {
              after: {
                content: `  ~${count}t`,
                inlineClassName: 'token-gutter-after',
              },
            },
          } as import('monaco-editor').editor.IModelDeltaDecoration;
        })
        .filter((d): d is import('monaco-editor').editor.IModelDeltaDecoration => d !== null);

      tokenDecorations = mainEditor.deltaDecorations(tokenDecorations, decorations);
    }, 300);
    return () => { if (tokenTimer) clearTimeout(tokenTimer); };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="editor-tab"
  class:dragging={dragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleFileDrop}
>
  <!-- Toolbar -->
  <div class="editor-toolbar">
    <div class="toolbar-left">
      <span class="toolbar-label">editor</span>
      {#if activeFile && activeFormatBadge}
        <span class="format-badge">{activeFormatBadge}</span>
      {/if}
      <button class="tb-btn" onclick={() => fileInputRef?.click()}>open ↑</button>
      <button class="tb-btn" onclick={newFile}>new +</button>
    </div>
    <div class="toolbar-right">
      <!-- Undo / Redo / Read-only -->
      <button class="tb-btn" onclick={editorUndo} disabled={!mainEditor} title="Undo (⌘Z)">↩ undo</button>
      <button class="tb-btn" onclick={editorRedo} disabled={!mainEditor} title="Redo (⌘⇧Z)">↪ redo</button>
      <button
        class="tb-btn tb-readonly"
        class:locked={activeFile?.readOnly}
        class:unlocked={activeFile && !activeFile?.readOnly}
        onclick={toggleReadOnly}
        disabled={!activeFile}
        title={activeFile?.readOnly ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
        aria-label={activeFile?.readOnly ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
      >
        {#if activeFile?.readOnly}
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1"/>
            <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
          </svg>
        {:else}
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1"/>
            <path d="M5 7V5a3 3 0 0 1 5.4-1.8"/>
          </svg>
        {/if}
      </button>
      <div class="save-wrap" style="position:relative">
        <button class="tb-btn" disabled={!activeFile} onclick={() => saveMenuOpen = !saveMenuOpen} title="Save file">↓ save ▾</button>
        {#if saveMenuOpen && activeFile}
          <div class="save-menu" role="menu">
            <button class="save-menu-item" role="menuitem" onclick={downloadSourceFile}>source file</button>
            <button class="save-menu-item" role="menuitem" onclick={downloadGeneratedFile} disabled={!$editorState.splitPaneOpen}>generated file</button>
          </div>
          <div class="save-backdrop" onclick={() => saveMenuOpen = false} aria-hidden="true"></div>
        {/if}
      </div>
      <!-- Split pane toggle + orientation -->
      <button class="tb-btn" class:active={$editorState.splitPaneOpen} onclick={toggleSplitPane}>
        split {$editorState.splitPaneOpen ? '✓' : ''}
      </button>
      {#if $editorState.splitPaneOpen}
        <select
          class="format-select"
          value={$editorState.splitPaneFormat}
          onchange={(e) => setSplitPaneFormat(e.currentTarget.value as any)}
          aria-label="Preview format"
        >
          {#each availableSplitFormats as fmt (fmt.value)}
            <option value={fmt.value}>{fmt.label}</option>
          {/each}
        </select>
        {#if $editorState.splitPaneFormat !== 'csv'}
          <button class="tb-btn" class:active={diffMode} onclick={() => (diffMode = !diffMode)} title="Toggle diff view">diff {diffMode ? '✓' : ''}</button>
        {/if}
        <button class="tb-btn" onclick={toggleSplitPaneOrientation} title="Toggle orientation">
          {$editorState.splitPaneOrientation === 'vertical' ? '⫼' : '⬓'}
        </button>
      {/if}
      <!-- Token gutter toggle (Task 4) -->
      {#if activeFileExt === 'jsonl'}
        <button class="tb-btn" class:active={showTokenGutter} onclick={() => { showTokenGutter = !showTokenGutter; try { localStorage.setItem(TOKEN_GUTTER_KEY, String(showTokenGutter)); } catch {} }} title="Toggle per-line token counts">tokens</button>
      {/if}
      <!-- Action menu -->
      <div class="dropdown-wrap">
        <button class="tb-btn" onclick={() => (actionMenuOpen = !actionMenuOpen)} disabled={!activeFile}>
          actions ▾
        </button>
        {#if actionMenuOpen}
          <div class="dropdown-menu">
            <div class="dropdown-section">text</div>
            <button class="dropdown-item" onclick={actionSort}>sort lines</button>
            <button class="dropdown-item" onclick={actionDedupe}>dedupe</button>
            <button class="dropdown-item" onclick={actionTrim}>trim trailing whitespace</button>
            <button class="dropdown-item" onclick={actionNormalize}>normalize unicode</button>
            <button class="dropdown-item" onclick={actionUpper}>UPPERCASE</button>
            <button class="dropdown-item" onclick={actionLower}>lowercase</button>
            <div class="dropdown-section">convert</div>
            <button class="dropdown-item" onclick={() => actionConvertTo('json')}>convert to JSON</button>
            <button class="dropdown-item" onclick={() => actionConvertTo('csv')}>convert to CSV</button>
            <button class="dropdown-item" onclick={() => actionConvertTo('md')}>convert to Markdown</button>
            <button class="dropdown-item" onclick={() => actionConvertTo('txt')}>convert to plain text</button>
            <button class="dropdown-item" onclick={() => actionConvertTo('alpaca')}>convert to Alpaca</button>
            <button class="dropdown-item" onclick={() => actionConvertTo('sharegpt')}>convert to ShareGPT</button>
            <div class="dropdown-section">lint</div>
            <button class="dropdown-item" onclick={actionLint}>open linter ↓</button>
            <div class="dropdown-section">send to</div>
            <button class="dropdown-item" onclick={() => sendTo('convert')}>↗ Convert</button>
            <button class="dropdown-item" onclick={() => sendTo('chunk')}>↗ Chunk</button>
            <button class="dropdown-item" onclick={sendToUtilities}>↗ Utilities</button>
            {#if $editorSelection?.text}
              <div class="dropdown-section">send selection to</div>
              <button class="dropdown-item" onclick={() => { sendToConvert($editorSelection!.text); showToast('✓ sent selection to Convert'); actionMenuOpen = false; }}>↗ Convert (selection)</button>
              <button class="dropdown-item" onclick={() => { sendToChunk($editorSelection!.text); showToast('✓ sent selection to Chunk'); actionMenuOpen = false; }}>↗ Chunk (selection)</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if activeFile && !isEmpty}
    <EditorFormatBar
      format={guessLanguage(activeFile.name, activeFile.content)}
      fileExt={activeFileExt}
      editor={mainEditor}
      content={activeFile.content}
    />
  {/if}

  <!-- File tabs -->
  {#if !isEmpty}
    <div class="file-tabs" role="tablist" aria-label="Open files">
      {#each $editorState.openFiles as f (f.id)}
        <div
          class="file-tab"
          class:active={f.id === $editorState.activeFileId}
          role="tab"
          aria-selected={f.id === $editorState.activeFileId}
          tabindex="0"
          onclick={() => selectFile(f.id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectFile(f.id); }}
        >
          {#if f.dirty}<span class="dirty-dot" aria-label="unsaved">●</span>{/if}
          <span class="file-name">{f.name}</span>
          <button
            class="close-btn"
            onclick={(e) => { e.stopPropagation(); attemptCloseFile(f.id); }}
            aria-label={`Close ${f.name}`}
          >×</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Editor area -->
  <div class="editor-body" class:split-vertical={$editorState.splitPaneOpen && $editorState.splitPaneOrientation === 'vertical'} class:split-horizontal={$editorState.splitPaneOpen && $editorState.splitPaneOrientation === 'horizontal'}>
    {#if isEmpty}
      <div class="empty-state">
        <div class="empty-card">
          <p class="empty-headline">drop a file here, or press the <button class="link-btn" onclick={() => fileInputRef?.click()}>open ↑</button> button</p>
          <p class="empty-formats">.txt .md .json .jsonl .csv .docx .pdf .xlsx .png .jpg</p>
          <p class="empty-or">or <button class="link-btn" onclick={newFile}>create a new file</button></p>
        </div>
      </div>
    {:else}
      <div class="editor-pane-wrap">
        <div class="editor-pane" bind:this={editorContainer}></div>
        {#if activeFile && activeFileExt === 'csv'}
          <div class="csv-overlay">
            <CsvTableView
              csvText={activeFile.content}
              delimiter={$convertState.formatSettings.csv.delimiter}
              hasHeader={$convertState.formatSettings.csv.header}
            />
          </div>
        {/if}
      </div>
      {#if $editorState.splitPaneOpen}
        <div class="split-divider" aria-hidden="true"></div>
        {#if $editorState.splitPaneFormat === 'csv'}
          <div class="editor-pane preview-pane csv-view">
            <CsvTableView
              csvText={csvPreviewContent}
              delimiter={$convertState.formatSettings.csv.delimiter}
              hasHeader={$convertState.formatSettings.csv.header}
            />
          </div>
        {:else if diffMode}
          <div class="editor-pane preview-pane" bind:this={diffContainer}></div>
        {:else}
          <div class="editor-pane preview-pane" bind:this={previewContainer}></div>
        {/if}
      {/if}
    {/if}

    {#if dragOver}
      <div class="drop-overlay" aria-hidden="true">
        <span>drop file here</span>
      </div>
    {/if}

    {#if parseStatus}
      <div class="parse-status">{parseStatus}</div>
    {/if}
  </div>

  <!-- Bottom panel (Find / Linter) -->
  <div class="bottom-panel" class:open={$editorState.bottomPanelOpen}>
    <button
      class="panel-header"
      onclick={toggleBottomPanel}
      aria-expanded={$editorState.bottomPanelOpen}
      aria-controls="bottom-panel-content"
    >
      {$editorState.bottomPanelOpen ? '▾' : '▸'} {$editorState.bottomPanelTab.toUpperCase()}
    </button>
    {#if $editorState.bottomPanelOpen}
      <div class="panel-tabs">
        <button class:active={$editorState.bottomPanelTab === 'find'} onclick={() => setBottomPanelTab('find')}>Find</button>
        <button class:active={$editorState.bottomPanelTab === 'linter'} onclick={() => setBottomPanelTab('linter')}>
          Linter{#if lintProblems.length > 0}&nbsp;<span class="badge">{lintProblems.length}</span>{/if}
        </button>
      </div>
      <div class="panel-content" id="bottom-panel-content">
        {#if $editorState.bottomPanelTab === 'find'}
          <!-- Task 3: Cross-file Find & Replace -->
          <div class="find-bar">
            <input
              class="find-input"
              type="text"
              placeholder="Search…"
              bind:value={findSearch}
              aria-label="Search term"
            />
            <input
              class="find-input"
              type="text"
              placeholder="Replace…"
              bind:value={findReplace}
              aria-label="Replace term"
            />
            <label class="find-toggle" title="Match case">
              <input type="checkbox" bind:checked={findMatchCase} /> Aa
            </label>
            <label class="find-toggle" title="Use regex">
              <input type="checkbox" bind:checked={findUseRegex} /> .*
            </label>
            {#if findMatches.length > 0}
              <button class="tb-btn" onclick={() => { if (findMatches[0]) doReplaceOne(findMatches[0]); }}>replace</button>
              <button class="tb-btn" onclick={() => { const id = $editorState.activeFileId; if (id) doReplaceAllInFile(id); }}>replace in file</button>
              <button class="tb-btn" onclick={doReplaceAll}>replace all</button>
            {/if}
            {#if findSearch.trim()}
              <span class="find-count" title={findTruncated ? 'Results capped at 500 per file' : ''}>
                {findTruncated ? `${findMatches.length}+ matches (capped)` : `${findMatches.length} match${findMatches.length === 1 ? '' : 'es'}`}
              </span>
            {/if}
          </div>
          {#if findMatches.length > 0}
            <div class="find-results">
              {#each findMatches as match (match.fileId + ':' + match.line + ':' + match.matchStart)}
                <button class="find-row" onclick={() => findJumpTo(match)}>
                  <span class="find-file">{match.fileName}:{match.line}</span>
                  <span class="find-line-text">
                    {match.lineText.slice(Math.max(0, match.matchStart - 20), match.matchStart)}<span class="find-highlight">{match.lineText.slice(match.matchStart, match.matchEnd)}</span>{match.lineText.slice(match.matchEnd, match.matchEnd + 40)}
                  </span>
                </button>
              {/each}
            </div>
          {:else if findSearch.trim()}
            <p class="panel-hint">No matches.</p>
          {/if}
        {:else}
          <!-- Task 2: Live Linter -->
          {#if !['jsonl', 'json', 'csv'].includes(activeFileExt)}
            <p class="panel-hint">Linter supports .jsonl, .json, and .csv files.</p>
          {:else if lintProblems.length === 0}
            <p class="panel-hint">No problems found.</p>
          {:else}
            <div class="lint-results">
              {#each lintProblems as prob (prob.line + ':' + prob.code + ':' + prob.field)}
                <button
                  class="lint-row"
                  onclick={() => {
                    if (prob.line > 0) {
                      mainEditor?.setPosition({ lineNumber: prob.line, column: 1 });
                      mainEditor?.revealLineInCenter(prob.line);
                      mainEditor?.focus();
                    }
                  }}
                  disabled={prob.line === 0}
                >
                  <span class="lint-loc">{prob.line > 0 ? `line ${prob.line}` : 'dataset'}</span>
                  <span class="lint-msg">{prob.message}</span>
                  {#if prob.suggestion}<span class="lint-hint">{prob.suggestion}</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<input
  bind:this={fileInputRef}
  type="file"
  multiple
  style="display:none"
  accept=".txt,.md,.markdown,.json,.jsonl,.csv,.docx,.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff"
  onchange={handleFileInput}
/>

{#if confirmingClose}
  <div class="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
    <div class="confirm-box">
      <p class="confirm-title" id="confirm-dialog-title">Discard unsaved changes to <span class="confirm-accent">{$editorState.openFiles.find(f => f.id === confirmingClose)?.name ?? ''}</span>?</p>
      <p class="confirm-sub">This file has not been saved. Closing will lose your edits.</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-clear" onclick={() => doCloseFile(confirmingClose!)}>discard</button>
        <button class="confirm-btn" onclick={() => (confirmingClose = null)}>cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if pasteToastMsg}
  <div class="toast toast-action-wrap" role="status" aria-live="polite">
    {pasteToastMsg}
    <button class="toast-action" onclick={() => { if (pendingPasteExpand) { pendingPasteExpand(); pendingPasteExpand = null; } }}>expand</button>
  </div>
{/if}

{#if toastMsg}
  {#if toastMsg.undo}
    <div class="toast toast-action-wrap" role="status" aria-live="polite">
      {toastMsg.message}
      <button class="toast-action" onclick={() => { toastMsg!.undo!(); toastMsg = null; if (toastTimer) clearTimeout(toastTimer); }}>undo</button>
    </div>
  {:else}
    <div class="toast" role="status" aria-live="polite">{toastMsg.message}</div>
  {/if}
{/if}

<style>
  .editor-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }
  .editor-tab.dragging .editor-body { opacity: 0.4; }

  /* ── Toolbar ── */
  .editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow: visible;
    position: relative;
    z-index: 50;
  }
  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .toolbar-label {
    font-size: 12px;
    color: var(--ink-dim);
    margin-right: 4px;
  }
  .format-badge {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-radius: 2px;
    padding: 1px 5px;
    letter-spacing: 0.04em;
  }
  .tb-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    padding: 2px 6px;
    border-radius: 2px;
  }
  .tb-btn:hover:not(:disabled) { color: var(--ink); background: var(--border); }
  .tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .tb-btn.active { color: var(--accent); }
  .tb-readonly {
    display: inline-flex;
    align-items: center;
    padding: 3px 6px;
  }
  .tb-readonly svg { flex-shrink: 0; }
  .tb-readonly.locked { color: var(--err); }
  .tb-readonly.locked:hover:not(:disabled) {
    color: var(--err);
    background: color-mix(in srgb, var(--err) 12%, transparent);
  }
  .tb-readonly.unlocked { color: var(--ok); }
  .tb-readonly.unlocked:hover:not(:disabled) {
    color: var(--ok);
    background: color-mix(in srgb, var(--ok) 12%, transparent);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  .save-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    z-index: 50;
    min-width: 130px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    overflow: hidden;
  }
  .save-menu-item {
    display: block;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--ink-dim);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    padding: 7px 12px;
    text-align: left;
  }
  .save-menu-item:last-child { border-bottom: none; }
  .save-menu-item:hover:not(:disabled) { background: var(--border); color: var(--ink); }
  .save-menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
  .save-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
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

  /* ── Dropdown ── */
  .dropdown-wrap { position: relative; }
  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 2px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    min-width: 200px;
    max-height: 360px;
    overflow-y: auto;
    z-index: 50;
    padding: 4px 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    padding: 4px 12px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
  }
  .dropdown-item:hover { background: var(--border); }
  .dropdown-item.active { color: var(--accent); }
  .dropdown-section {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 12px 2px;
  }
  .theme-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  /* ── File tabs ── */
  .file-tabs {
    display: flex;
    align-items: stretch;
    height: 32px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    flex-shrink: 0;
    padding: 0 8px;
  }
  .file-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    cursor: pointer;
    background: var(--surface);
    border-right: 1px solid var(--border);
    font-size: 13px;
    color: var(--ink-dim);
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .file-tab:hover { color: var(--ink); }
  .file-tab.active {
    background: var(--bg);
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  .dirty-dot {
    color: var(--accent);
    font-size: 10px;
    line-height: 1;
  }
  .file-name {
    font-family: inherit;
  }
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--ink-dim);
    font-size: 14px;
    padding: 0 4px;
    line-height: 1;
  }
  .close-btn:hover { color: var(--err); }

  /* ── Editor body ── */
  .editor-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }
  .editor-body.split-horizontal { flex-direction: column; }
  .editor-pane-wrap {
    flex: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
    display: flex;
  }
  .editor-pane { flex: 1; min-width: 0; min-height: 0; position: relative; }
  .csv-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: var(--bg);
    display: flex;
    flex-direction: column;
  }
  .preview-pane { border-left: 1px solid var(--border); }
  .editor-body.split-horizontal .preview-pane { border-left: none; border-top: 1px solid var(--border); }
  .csv-view { overflow: hidden; display: flex; flex-direction: column; }
  .split-divider {
    width: 1px;
    background: var(--border);
    flex-shrink: 0;
  }
  .editor-body.split-horizontal .split-divider { width: auto; height: 1px; }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .empty-card {
    border: 1px dashed var(--border);
    border-radius: 4px;
    padding: 48px 64px;
    text-align: center;
    max-width: 600px;
  }
  .empty-headline {
    color: var(--ink-dim);
    font-size: 14px;
    margin: 0 0 12px 0;
  }
  .empty-formats {
    color: var(--muted);
    font-size: 12px;
    margin: 8px 0;
    letter-spacing: 0.02em;
  }
  .empty-or {
    color: var(--ink-dim);
    font-size: 13px;
    margin: 12px 0 0 0;
  }
  .link-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--accent);
    font-family: inherit;
    font-size: inherit;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .drop-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(14, 17, 22, 0.85);
    border: 2px dashed var(--accent);
    color: var(--accent);
    font-size: 14px;
    pointer-events: none;
    z-index: 30;
  }

  .parse-status {
    position: absolute;
    bottom: 8px;
    right: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 10px;
    color: var(--accent);
    font-size: 12px;
    z-index: 20;
  }

  /* ── Bottom panel ── */
  .bottom-panel {
    border-top: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }
  .panel-header {
    width: 100%;
    text-align: left;
    padding: 6px 14px;
    background: var(--surface);
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .panel-header:hover { color: var(--ink); }
  .bottom-panel.open { max-height: 240px; display: flex; flex-direction: column; }
  .panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    padding: 0 14px;
  }
  .panel-tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .panel-tabs button.active {
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
  }
  .panel-hint {
    font-size: 12px;
    color: var(--ink-dim);
    margin: 0;
    line-height: 1.5;
  }
  .panel-hint code {
    background: var(--bg);
    padding: 1px 4px;
    border-radius: 2px;
    color: var(--accent);
    font-family: inherit;
  }

  /* ── Confirm dialog ── */
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
  .confirm-title { font-size: 13px; color: var(--ink); margin: 0; }
  .confirm-accent { color: var(--accent); }
  .confirm-sub { font-size: 12px; color: var(--ink-dim); margin: 0 0 12px 0; }
  .confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
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

  /* ── Toast ── */
  .toast {
    position: fixed;
    bottom: 40px;
    right: 16px;
    background: var(--surface);
    border: 1px solid var(--ok);
    border-radius: 3px;
    padding: 4px 10px;
    color: var(--ok);
    font-size: 12px;
    z-index: 60;
    pointer-events: none;
  }
  .toast-action-wrap { pointer-events: auto; display: flex; align-items: center; gap: 8px; }
  .toast-action {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
    font-size: 12px;
    font-family: inherit;
  }
  .toast-action:hover { opacity: 0.8; }

  /* ── Linter panel ── */
  .badge {
    display: inline-block;
    background: var(--err);
    color: #fff;
    border-radius: 8px;
    font-size: 10px;
    padding: 0 5px;
    min-width: 16px;
    text-align: center;
    vertical-align: middle;
    line-height: 14px;
  }
  .lint-results {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .lint-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 4px 2px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
  }
  .lint-row:hover:not(:disabled) { background: var(--border); }
  .lint-row:disabled { cursor: default; }
  .lint-loc {
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 11px;
  }
  .lint-msg { color: var(--err); flex: 1; min-width: 0; }
  .lint-hint { color: var(--ink-dim); font-size: 11px; flex-shrink: 0; }

  /* ── Find panel ── */
  .find-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .find-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 2px 6px;
    min-width: 120px;
    max-width: 200px;
  }
  .find-input:focus { outline: 1px solid var(--accent); }
  .find-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
    user-select: none;
  }
  .find-toggle input { accent-color: var(--accent); cursor: pointer; }
  .find-count {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .find-results {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 130px;
    overflow-y: auto;
  }
  .find-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 3px 2px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
  }
  .find-row:hover { background: var(--border); }
  .find-file {
    color: var(--muted);
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 11px;
  }
  .find-line-text {
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .find-highlight {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border-radius: 1px;
  }

  /* ── Token gutter ── */
  :global(.token-gutter-after) {
    color: var(--muted, #666);
    opacity: 0.55;
    font-size: 11px;
    pointer-events: none;
  }
</style>
