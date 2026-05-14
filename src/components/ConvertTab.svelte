<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { convertState, type DatasetFile, type ExportFormat } from '../stores/convertState';
  import { shellState, openPalette, clearPaletteAction, consumePendingConvertSource, setTab, convertStatsOpen, convertHfDialogOpen } from '../stores/shellState';
  import { openFile as openInEditorTab, openFileWithSplitPane, splitPaneInitialPreview, openFile, pendingJump } from '../stores/editorState';
  import { isMac } from '../lib/platform';
  import { analytics } from '../lib/analytics';
  import EditorIsland from './EditorIsland.svelte';
  import ConvertToolbar from './ConvertToolbar.svelte';
  import ConvertProblemsPanel from './ConvertProblemsPanel.svelte';
  import ConvertImportPanel from './ConvertImportPanel.svelte';
  import ConvertDatasetPanel from './ConvertDatasetPanel.svelte';
  import ChunkTrustStrip from './ChunkTrustStrip.svelte';
  import HfHubPushDialog from './HfHubPushDialog.svelte';
  import ConvertStatsPanel from './ConvertStatsPanel.svelte';
  import { validateJsonl } from '../lib/validate';
  import { approximateTokens } from '../lib/tokenize';
  import { calculateTrainingCost } from '../lib/pricing';
  import { encodeConvertShare, decodeShareFragment } from '../lib/share-url';
  import presetsData from '../data/presets.json';
  import { appSettings } from '../stores/appSettings';
  import type { Preset } from '../lib/validate';
  import type { TokenizeMessage, TokenizeResponse } from '../lib/tokenize';
  import {
    buildExportContent as libBuildExportContent,
    extractMessages as libExtractMessages,
    asChunks as libAsChunks,
  } from '../lib/format-convert';

  let editorRef: EditorIsland | undefined = $state();
  let validateTimer: ReturnType<typeof setTimeout> | undefined;
  let tokenizeWorker: Worker | undefined;
  let copyFeedback = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let showImportPanel = $state(false);
  let suppressNextChange = false;
  let selectedDatasetFileId = $state<string | undefined>(undefined);
  let pendingFormat = $state<ExportFormat | null>(null);
  let confirmingClearDataset = $state(false);
  let pendingRemoveFileId = $state<string | null>(null);
  let filenameDialog = $state<{ type: 'combined' | 'zip'; ext: string; blob: Blob } | null>(null);
  let showHfDialog = $derived($convertHfDialogOpen);
  let statsOpen = $derived($convertStatsOpen);
  let filenameInput = $state('');
  let pendingPreset = $state<string | null>(null);
  let pendingPresetErrorDelta = $state(0);

  function getTokenizeWorker(): Worker {
    if (!tokenizeWorker) {
      tokenizeWorker = new Worker(
        new URL('../workers/tokenize.worker.ts', import.meta.url),
        { type: 'module' }
      );
      tokenizeWorker.onmessage = (e: MessageEvent<TokenizeResponse>) => {
        if (e.data.exact) {
          convertState.update(s => ({ ...s, exactTokens: e.data.tokens }));
          analytics.exactCalculated(e.data.tokens);
        }
      };
    }
    return tokenizeWorker;
  }

  function getPreset(id: string): Preset {
    return (presetsData.find((p) => p.id === id) ?? presetsData[0]) as Preset;
  }

  function processContent(content: string, presetId: string) {
    if (!content.trim()) {
      convertState.update((s) => ({
        ...s,
        lineCount: 0,
        approximateTokens: null,
        exactTokens: null,
        cost: null,
        errors: [],
      }));
      return;
    }

    const preset = getPreset(presetId);
    const tokens = approximateTokens(content);
    const cost = calculateTrainingCost(tokens, preset);
    const nonEmptyLines = content.split('\n').filter((l) => l.trim()).length;

    convertState.update((s) => ({
      ...s,
      lineCount: nonEmptyLines,
      approximateTokens: tokens,
      cost,
      exactTokens: null,
    }));

    if (validateTimer) clearTimeout(validateTimer);
    validateTimer = setTimeout(() => {
      const errors = validateJsonl(content, preset);
      convertState.update((s) => ({ ...s, errors }));
    }, 200);
  }

  let wasEmpty = true;

  function handleEditorChange(content: string) {
    if (suppressNextChange) { suppressNextChange = false; return; }
    convertState.update((s) => ({ ...s, editorContent: content }));
    const isEmpty = !content.trim();
    if (wasEmpty && !isEmpty) {
      const lines = content.split('\n').filter(l => l.trim()).length;
      analytics.datasetPasted(lines, $convertState.presetId);
    }
    wasEmpty = isEmpty;
    processContent(content, $convertState.presetId);
  }

  function openProblemInEditor(line: number) {
    const fileId = openFile('dataset.jsonl', $convertState.editorContent);
    pendingJump.set({ fileId, line });
    setTab('editor');
  }

  // ── Sampling ──────────────────────────────────────────────────────────────

  let SAMPLE_THRESHOLD = $derived($appSettings.convertSampleThreshold);
  const SAMPLE_HEAD = 50;
  const SAMPLE_TAIL = 50;

  function buildSampleDisplay(lines: string[]): string {
    const head = lines.slice(0, SAMPLE_HEAD);
    const tail = lines.slice(lines.length - SAMPLE_TAIL);
    const hidden = lines.length - SAMPLE_HEAD - SAMPLE_TAIL;
    return head.join('\n') + `\n…(${hidden} records hidden)…\n` + tail.join('\n');
  }

  function isSampled(): boolean {
    return $convertState.editorDisplayOverride !== null;
  }

  function clearSample() {
    const full = $convertState.editorContent;
    convertState.update(s => ({ ...s, editorDisplayOverride: null }));
    suppressNextChange = true;
    editorRef?.setValue(full);
  }

  function editFullInEditor() {
    const full = $convertState.editorContent;
    const selectedFile = $convertState.datasetFiles.find(f => f.id === selectedDatasetFileId);
    const name = selectedFile?.name ?? 'dataset.jsonl';
    openInEditorTab(name, full);
    setTab('editor');
  }

  // ── Dataset management ────────────────────────────────────────────────────

  function showFile(file: DatasetFile) {
    selectedDatasetFileId = file.id;
    const lines = file.content.split('\n').filter(l => l.trim());
    if (lines.length > SAMPLE_THRESHOLD) {
      const display = buildSampleDisplay(lines);
      convertState.update(s => ({ ...s, editorContent: file.content, editorDisplayOverride: display }));
      suppressNextChange = true;
      editorRef?.setValue(display);
      processContent(file.content, $convertState.presetId);
    } else {
      convertState.update(s => ({ ...s, editorDisplayOverride: null }));
      suppressNextChange = true;
      editorRef?.setValue(file.content);
      handleEditorChange(file.content);
    }
  }

  function addToDataset(
    name: string,
    content: string,
    rawSource?: string,
    importTemplate?: import('../lib/convert-import').ImportTemplate,
    importSystemPrompt?: string,
    importChunkSize?: number,
  ) {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;
    const file: DatasetFile = {
      id: crypto.randomUUID(),
      name,
      lineCount: lines.length,
      status: 'done',
      content: lines.join('\n'),
      rawSource,
      importTemplate,
      importSystemPrompt,
      importChunkSize,
    };
    convertState.update(s => ({ ...s, datasetFiles: [...s.datasetFiles, file] }));
    showFile(file);
  }

  function selectDatasetFile(id: string) {
    const file = $convertState.datasetFiles.find(f => f.id === id);
    if (file) showFile(file);
  }

  function removeFileFromDataset(id: string) {
    pendingRemoveFileId = id;
  }

  function confirmRemoveFile() {
    const id = pendingRemoveFileId;
    if (!id) return;
    const newFiles = $convertState.datasetFiles.filter(f => f.id !== id);
    convertState.update(s => ({ ...s, datasetFiles: newFiles }));
    if (newFiles.length > 0) {
      const next = selectedDatasetFileId === id ? newFiles[0] : newFiles.find(f => f.id === selectedDatasetFileId) ?? newFiles[0];
      showFile(next);
    } else {
      selectedDatasetFileId = undefined;
      convertState.update(s => ({ ...s, editorDisplayOverride: null }));
      suppressNextChange = true;
      editorRef?.setValue('');
      handleEditorChange('');
    }
    pendingRemoveFileId = null;
  }

  let pendingRemoveFileName = $derived(
    pendingRemoveFileId
      ? $convertState.datasetFiles.find(f => f.id === pendingRemoveFileId)?.name ?? 'this file'
      : ''
  );

  function clearDataset() {
    if ($convertState.datasetFiles.length === 0) return;
    confirmingClearDataset = true;
  }

  function confirmClearDataset() {
    convertState.update(s => ({ ...s, datasetFiles: [], editorDisplayOverride: null, presetUnlocked: false }));
    selectedDatasetFileId = undefined;
    suppressNextChange = true;
    editorRef?.setValue('');
    handleEditorChange('');
    confirmingClearDataset = false;
  }

  function combineDataset() {
    const files = $convertState.datasetFiles;
    if (files.length < 2) return;
    const combined = files.map(f => f.content).join('\n');
    const mergedFile: DatasetFile = {
      id: crypto.randomUUID(),
      name: 'combined',
      lineCount: combined.split('\n').filter(l => l.trim()).length,
      status: 'done',
      content: combined,
    };
    convertState.update(s => ({ ...s, datasetFiles: [mergedFile] }));
    showFile(mergedFile);
  }

  function reorderDatasetFiles(sourceId: string, targetId: string, position: 'before' | 'after') {
    convertState.update(s => {
      const files = [...s.datasetFiles];
      const srcIdx = files.findIndex(f => f.id === sourceId);
      const tgtIdx = files.findIndex(f => f.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return s;
      const [moved] = files.splice(srcIdx, 1);
      const insertAt = files.findIndex(f => f.id === targetId);
      files.splice(position === 'before' ? insertAt : insertAt + 1, 0, moved);
      return { ...s, datasetFiles: files };
    });
  }

  function bulkRemoveFiles(ids: string[]) {
    const idSet = new Set(ids);
    convertState.update(s => {
      const newFiles = s.datasetFiles.filter(f => !idSet.has(f.id));
      return { ...s, datasetFiles: newFiles };
    });
    const remaining = $convertState.datasetFiles;
    if (remaining.length > 0) {
      const next = remaining.find(f => !idSet.has(f.id)) ?? remaining[0];
      showFile(next);
    } else {
      selectedDatasetFileId = undefined;
      convertState.update(s => ({ ...s, editorDisplayOverride: null }));
      suppressNextChange = true;
      editorRef?.setValue('');
      handleEditorChange('');
    }
  }

  function bulkCombineFiles(ids: string[]) {
    const files = $convertState.datasetFiles;
    const toMerge = ids.map(id => files.find(f => f.id === id)).filter((f): f is DatasetFile => !!f);
    if (toMerge.length < 2) return;
    const combined = toMerge.map(f => f.content).join('\n');
    const mergedFile: DatasetFile = {
      id: crypto.randomUUID(),
      name: toMerge.map(f => f.name.replace(/\.[^.]+$/, '')).join('+'),
      lineCount: combined.split('\n').filter(l => l.trim()).length,
      status: 'done',
      content: combined,
    };
    const idSet = new Set(ids);
    convertState.update(s => ({
      ...s,
      datasetFiles: [...s.datasetFiles.filter(f => !idSet.has(f.id)), mergedFile],
    }));
    showFile(mergedFile);
  }

  // ─────────────────────────────────────────────────────────────────────────

  function handleFormatChange(id: ExportFormat) {
    if (id === $convertState.exportFormat) return;
    if ($convertState.editorContent.trim()) {
      pendingFormat = id;
    } else {
      convertState.update(s => ({ ...s, exportFormat: id }));
    }
  }

  function confirmClearAndSwitch() {
    if (!pendingFormat) return;
    convertState.update(s => ({ ...s, exportFormat: pendingFormat!, datasetFiles: [], editorDisplayOverride: null }));
    pendingFormat = null;
    selectedDatasetFileId = undefined;
    suppressNextChange = true;
    editorRef?.setValue('');
    handleEditorChange('');
  }

  function handlePresetChange(newPresetId: string) {
    const content = $convertState.editorContent;
    // Always confirm when there's an active dataset — switching the preset
    // means the output must be re-generated against new rules. The user can
    // cancel to revert the dropdown back to the previous preset.
    if (content.trim()) {
      const newPreset = getPreset(newPresetId);
      const newErrors = validateJsonl(content, newPreset);
      const currentCount = $convertState.errors.length;
      pendingPreset = newPresetId;
      pendingPresetErrorDelta = newErrors.length - currentCount;
      return;
    }
    applyPresetChange(newPresetId);
  }

  // If the auto-lock fires (or the user manually re-locks) while a preset
  // switch confirmation is open, treat it as an implicit cancel — close the
  // dialog AND revert the dropdown to the original preset.
  $effect(() => {
    if (!$convertState.presetUnlocked && pendingPreset) {
      pendingPreset = null;
      pendingPresetErrorDelta = 0;
      convertState.update(s => ({ ...s, presetSelectVersion: s.presetSelectVersion + 1 }));
    }
  });

  async function regenerateAllFromOriginals(_newPresetId: string): Promise<{ regenerated: number; skipped: number }> {
    const { fileToConversationalJsonl } = await import('../lib/convert-import');
    const files = $convertState.datasetFiles;

    let regenerated = 0;
    let skipped = 0;

    const updatedFiles: DatasetFile[] = files.map((f) => {
      if (!f.rawSource) {
        skipped++;
        return f; // pasted JSONL — keep as-is
      }
      try {
        const tmpl = f.importTemplate ?? 'qa';
        const prompt = f.importSystemPrompt ?? 'You are a helpful assistant.';
        const size = f.importChunkSize ?? 512;
        const newJsonl = fileToConversationalJsonl(f.rawSource, tmpl, prompt, size);
        regenerated++;
        return {
          ...f,
          content: newJsonl,
          lineCount: newJsonl ? newJsonl.split('\n').filter(l => l.trim()).length : 0,
          status: 'done' as const,
        };
      } catch (err) {
        return { ...f, status: 'error' as const, error: String(err) };
      }
    });

    const combined = updatedFiles.map(f => f.content).filter(Boolean).join('\n');
    convertState.update(s => ({ ...s, datasetFiles: updatedFiles, editorContent: combined }));

    // Refresh the editor display to reflect the new content.
    suppressNextChange = true;
    editorRef?.setValue(combined);

    return { regenerated, skipped };
  }

  async function applyPresetChange(newPresetId: string) {
    convertState.update((s) => ({ ...s, presetId: newPresetId, exactTokens: null }));
    analytics.presetSwitched(newPresetId);

    // Regenerate from the original uploaded documents if we have them.
    const hasRawSources = $convertState.datasetFiles.some(f => !!f.rawSource);
    if (hasRawSources) {
      const result = await regenerateAllFromOriginals(newPresetId);
      if (result.skipped > 0) {
        console.info(`Regenerated ${result.regenerated} file(s); skipped ${result.skipped} pasted-JSONL file(s) — no rawSource to re-process.`);
      }
    }

    const content = $convertState.editorContent;
    if (content.trim()) processContent(content, newPresetId);
  }

  async function confirmPresetSwitch() {
    if (!pendingPreset) return;
    const id = pendingPreset;
    pendingPreset = null;
    pendingPresetErrorDelta = 0;
    await applyPresetChange(id);
  }

  function cancelPresetSwitch() {
    pendingPreset = null;
    pendingPresetErrorDelta = 0;
    // Force the toolbar select to re-paint with the (unchanged) store value
    // so the dropdown visually reverts to the previous preset.
    convertState.update(s => ({ ...s, presetSelectVersion: s.presetSelectVersion + 1 }));
  }

  function handleExactTokens() {
    const state = $convertState;
    if (!state.approximateTokens || !state.editorContent.trim()) return;
    const preset = getPreset(state.presetId);
    const msg: TokenizeMessage = {
      type: 'exact',
      text: state.editorContent,
      encoding: preset.tokenizer?.encoding ?? null,
    };
    getTokenizeWorker().postMessage(msg);
  }

  // ── Helpers (re-exported from src/lib/format-convert.ts) ────────────────
  const extractMessages = libExtractMessages;
  const asChunks = libAsChunks;

  // ── Multi-format export ───────────────────────────────────────────────────

  function buildExportContent(format: string): string {
    return libBuildExportContent($convertState.editorContent, format as any, $convertState.formatSettings);
  }

  // ── Parquet: lazy-loaded binary download ──────────────────────────────────

  async function downloadParquet() {
    const content = $convertState.editorContent;
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

    const chunks = asChunks(content);

    const { tableFromArrays, tableToIPC } = await import('apache-arrow');
    const parquetWasm = await import('parquet-wasm/esm/parquet_wasm.js');
    await parquetWasm.default();

    let arrowTable;
    if (chunks) {
      arrowTable = tableFromArrays({
        chunk_index: Int32Array.from(chunks.map(c => c.chunk_index)),
        content: chunks.map(c => c.content),
      });
    } else {
      const exampleIds: number[] = [];
      const turns: number[] = [];
      const roles: string[] = [];
      const contents: string[] = [];

      lines.forEach((line, exIdx) => {
        try {
          const obj = JSON.parse(line) as Record<string, unknown>;
          const msgs = extractMessages(obj);
          msgs.forEach((m, turnIdx) => {
            exampleIds.push(exIdx);
            turns.push(turnIdx);
            roles.push(m.role);
            contents.push(m.content);
          });
          if (msgs.length === 0) {
            exampleIds.push(exIdx);
            turns.push(0);
            roles.push('unknown');
            contents.push(line);
          }
        } catch {
          exampleIds.push(exIdx);
          turns.push(0);
          roles.push('unknown');
          contents.push(line);
        }
      });

      arrowTable = tableFromArrays({
        example_id: Int32Array.from(exampleIds),
        turn: Int32Array.from(turns),
        role: roles,
        content: contents,
      });
    }

    const ipcBytes = tableToIPC(arrowTable, 'stream');
    const wasmTable = parquetWasm.Table.fromIPCStream(ipcBytes);
    const { compression } = $convertState.formatSettings.parquet;
    let parquetBytes: Uint8Array;
    try {
      const writerProps = new parquetWasm.WriterPropertiesBuilder().setCompression(
        compression === 'snappy' ? parquetWasm.Compression.SNAPPY
        : compression === 'gzip' ? parquetWasm.Compression.GZIP
        : parquetWasm.Compression.UNCOMPRESSED
      ).build();
      parquetBytes = parquetWasm.writeParquet(wasmTable, writerProps);
    } catch {
      parquetBytes = parquetWasm.writeParquet(wasmTable);
    }

    const blob = new Blob([parquetBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dataset.parquet';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Extension + MIME helpers ──────────────────────────────────────────────

  function getExtension(format: string): string {
    const map: Record<string, string> = {
      jsonl: 'jsonl',
      json: 'json',
      csv: 'csv',
      tsv: 'tsv',
      parquet: 'parquet',
      md: 'md',
      txt: 'txt',
      alpaca: 'jsonl',
      sharegpt: 'jsonl',
    };
    return map[format] ?? 'txt';
  }

  function getMime(format: string): string {
    const map: Record<string, string> = {
      jsonl: 'application/jsonlines',
      json: 'application/json',
      csv: 'text/csv',
      tsv: 'text/tab-separated-values',
      parquet: 'application/octet-stream',
      md: 'text/markdown',
      txt: 'text/plain',
      alpaca: 'application/jsonlines',
      sharegpt: 'application/jsonlines',
    };
    return map[format] ?? 'text/plain';
  }

  // ── Copy + Download handlers ──────────────────────────────────────────────

  function getActiveContent(): string {
    const files = $convertState.datasetFiles;
    if (files.length === 0) return $convertState.editorContent;
    if (files.length === 1) return files[0].content;
    const sel = files.find(f => f.id === selectedDatasetFileId);
    return sel ? sel.content : $convertState.editorContent;
  }

  function buildExportContentFrom(fmt: string, rawContent: string, fileFormatOverride?: ExportFormat | null): string {
    const effectiveFmt = fileFormatOverride ?? fmt;
    const original = $convertState.editorContent;
    convertState.update(s => ({ ...s, editorContent: rawContent }));
    const result = libBuildExportContent(rawContent, effectiveFmt as any, $convertState.formatSettings);
    convertState.update(s => ({ ...s, editorContent: original }));
    return result;
  }

  function openCurrentInEditor() {
    const files = $convertState.datasetFiles;
    const fmt = $convertState.exportFormat;
    type SplitFmt = 'jsonl' | 'csv' | 'json' | 'md' | 'txt' | 'alpaca' | 'sharegpt';
    const splitFmt: SplitFmt = fmt === 'parquet' ? 'jsonl' : fmt as SplitFmt;

    if (files.length > 0) {
      let isFirst = true;
      for (const f of files) {
        const src = f.rawSource?.trim() ? f.rawSource : f.content;
        if (!src?.trim()) continue;
        if (isFirst) {
          const effectiveFmt = f.formatOverride ?? splitFmt;
          const previewContent = libBuildExportContent(f.content, effectiveFmt as any, $convertState.formatSettings);
          const fileId = openFileWithSplitPane(f.name, src, effectiveFmt as SplitFmt);
          splitPaneInitialPreview.set({ fileId, format: effectiveFmt as SplitFmt, content: previewContent });
          isFirst = false;
        } else {
          openInEditorTab(f.name, src);
        }
      }
      if (isFirst) {
        const content = $convertState.editorContent;
        if (!content.trim()) return;
        openFileWithSplitPane('dataset.jsonl', content, splitFmt);
      }
    } else {
      const content = $convertState.editorContent;
      if (!content.trim()) return;
      openFileWithSplitPane('dataset.jsonl', content, splitFmt);
    }

    setTab('editor');
  }

  function copyExport() {
    const fmt = $convertState.exportFormat;
    if (fmt === 'parquet') return;
    const raw = getActiveContent();
    const text = buildExportContentFrom(fmt, raw);
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).then(() => {
      if (copyTimer) clearTimeout(copyTimer);
      copyFeedback = 'copied';
      copyTimer = setTimeout(() => (copyFeedback = ''), 2000);
    });
  }

  function makeTimestamp(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
  }

  async function downloadZip() {
    const globalFmt = $convertState.exportFormat;
    const files = $convertState.datasetFiles;
    if (files.length === 0) return;
    const { buildZip } = await import('../lib/zip');
    const entries = files.map(f => {
      const fmt = f.formatOverride ?? globalFmt;
      const ext = getExtension(fmt);
      return {
        name: f.name.replace(/\.[^.]+$/, '') + '.' + ext,
        content: buildExportContentFrom(fmt, f.content, f.formatOverride),
      };
    });
    const blob = buildZip(entries);
    filenameInput = `dataset_${makeTimestamp()}`;
    filenameDialog = { type: 'zip', ext: 'zip', blob };
  }

  function downloadExport() {
    const fmt = $convertState.exportFormat;

    if (fmt === 'parquet') {
      downloadParquet();
      return;
    }

    const text = buildExportContent(fmt);
    if (!text.trim()) return;

    const ext = fmt === 'alpaca' || fmt === 'sharegpt' ? 'jsonl' : getExtension(fmt);
    const blob = new Blob([text], { type: getMime(fmt) });
    filenameInput = `dataset_${makeTimestamp()}`;
    filenameDialog = { type: 'combined', ext, blob };
  }

  function confirmFilenameDownload() {
    if (!filenameDialog) return;
    const name = (filenameInput.trim() || `dataset_${makeTimestamp()}`) + '.' + filenameDialog.ext;
    const url = URL.createObjectURL(filenameDialog.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    filenameDialog = null;
    filenameInput = '';
  }

  function copyShareLink() {
    const state = $convertState;
    if (!state.editorContent.trim()) return;

    const encoded = encodeConvertShare(state.presetId, state.editorContent);
    const url = `${location.origin}${location.pathname}#t=convert&s=${encoded}`;

    navigator.clipboard.writeText(url).then(() => {
      if (copyTimer) clearTimeout(copyTimer);
      copyFeedback = 'copied';
      copyTimer = setTimeout(() => (copyFeedback = ''), 2000);
      analytics.shareCopied();
    });
  }

  function loadExample(exampleId: string) {
    fetch(`/examples/convert/${exampleId}.jsonl`)
      .then((r) => r.text())
      .then((text) => {
        editorRef?.setValue(text);
        handleEditorChange(text);
        analytics.exampleLoaded(exampleId);
      })
      .catch(() => {});
  }

  function handleKeydown(e: KeyboardEvent) {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      handleExactTokens();
    }
    if (mod && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      copyShareLink();
    }
  }

  $effect(() => {
    const action = $shellState.pendingAction;
    if (!action) return;
    clearPaletteAction();
    if (action.type === 'load-example' && action.payload) {
      loadExample(action.payload);
    } else if (action.type === 'exact-tokens') {
      handleExactTokens();
    } else if (action.type === 'copy-share') {
      copyShareLink();
    } else if (action.type === 'switch-preset' && action.payload) {
      handlePresetChange(action.payload);
    }
  });

  onMount(() => {
    const payload = decodeShareFragment(location.hash);
    if (payload?.tab === 'convert') {
      const content = payload.lines.join('\n');
      convertState.update((s) => ({ ...s, presetId: payload.presetId }));
      analytics.shareOpenedFromUrl();
      setTimeout(() => {
        editorRef?.setValue(content);
        handleEditorChange(content);
      }, 50);
      return;
    }
    // Rehydrate editor from persisted convertState. editorRef may not be
    // bound yet, so wait a tick.
    const persisted = $convertState.editorDisplayOverride ?? $convertState.editorContent;
    if (persisted) {
      queueMicrotask(() => {
        if (editorRef) {
          suppressNextChange = true;
          editorRef.setValue(persisted);
          handleEditorChange($convertState.editorContent);
        }
      });
    }
  });

  $effect(() => {
    if ($shellState.pendingConvertSource && editorRef) {
      const source = consumePendingConvertSource();
      if (source) {
        suppressNextChange = true;
        editorRef.setValue(source);
        handleEditorChange(source);
      }
    }
  });

  onDestroy(() => {
    if (validateTimer) clearTimeout(validateTimer);
    if (copyTimer) clearTimeout(copyTimer);
    tokenizeWorker?.terminate();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<ConvertToolbar
  oncopy={copyExport}
  ondownload={downloadExport}
  ondownloadzip={downloadZip}
  onopeneditor={openCurrentInEditor}
  datasetFileCount={$convertState.datasetFiles.length}
  onpresetchange={handlePresetChange}
  onformatchange={handleFormatChange}
  copyFeedback={copyFeedback}
  onimporttoggle={() => (showImportPanel = !showImportPanel)}
  onhfpush={() => convertHfDialogOpen.set(true)}
  onstatstoggle={() => convertStatsOpen.update(v => !v)}
  statsOpen={statsOpen}
/>

{#if showImportPanel}
  <ConvertImportPanel
    exportFormat={$convertState.exportFormat}
    existingNames={$convertState.datasetFiles.map(f => f.name)}
    ongenerate={(results) => { for (const r of results) addToDataset(r.filename, r.jsonl, r.rawSource, r.template, r.systemPrompt, r.chunkSize); showImportPanel = false; }}
    onclose={() => (showImportPanel = false)}
  />
{/if}

{#if isSampled()}
  <div class="sample-banner">
    <span class="sample-info">Sampled: first {SAMPLE_HEAD} + last {SAMPLE_TAIL} of {$convertState.datasetFiles.find(f => f.id === selectedDatasetFileId)?.lineCount ?? 0} records.</span>
    <button class="sample-btn" onclick={clearSample}>show all</button>
    <button class="sample-btn" onclick={editFullInEditor}>edit full</button>
  </div>
{/if}

<div class="convert-body">
  <div class="editor-area" class:hidden={statsOpen}>
    <EditorIsland
      bind:this={editorRef}
      mode="jsonl"
      placeholder="// drop a JSONL file or import → · hand-edit in Editor tab ({isMac() ? '⌘3' : 'Ctrl+3'})"
      ariaLabel="JSONL dataset viewer (read-only)"
      editable={false}
      onchange={handleEditorChange}
    />
  </div>
  {#if statsOpen}
    <ConvertStatsPanel />
  {/if}
  {#if $convertState.datasetFiles.length > 0 && !statsOpen}
    <ConvertDatasetPanel
      selectedId={selectedDatasetFileId}
      globalFormat={$convertState.exportFormat}
      onselect={selectDatasetFile}
      onremove={removeFileFromDataset}
      onclear={clearDataset}
      oncombine={combineDataset}
      onreorder={reorderDatasetFiles}
      onbulkremove={bulkRemoveFiles}
      onbulkcombine={bulkCombineFiles}
      onformatchange={(id, fmt) => {
        convertState.update(s => ({
          ...s,
          datasetFiles: s.datasetFiles.map(f => f.id === id ? { ...f, formatOverride: fmt } : f),
        }));
      }}
    />
  {/if}
</div>

<ConvertProblemsPanel
  onjumpline={(line) => editorRef?.jumpToLine(line)}
  content={$convertState.editorContent}
  onfix={(newContent) => { editorRef?.setValue(newContent); handleEditorChange(newContent); }}
  onopenateditor={openProblemInEditor}
/>
<ChunkTrustStrip />


{#if pendingFormat}
  <div class="format-switch-overlay" role="dialog" aria-modal="true" aria-label="Switch format">
    <div class="format-switch-box">
      <p class="switch-title">Switch to <span class="switch-fmt">{pendingFormat.toUpperCase()}</span>?</p>
      <p class="switch-sub">Clear the editor to switch formats.</p>
      <div class="switch-actions">
        <button class="switch-btn switch-clear" onclick={confirmClearAndSwitch}>clear + switch</button>
        <button class="switch-btn switch-cancel" onclick={() => (pendingFormat = null)}>cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if confirmingClearDataset}
  <div class="format-switch-overlay" role="dialog" aria-modal="true" aria-label="Clear dataset">
    <div class="format-switch-box">
      <p class="switch-title">Clear all <span class="switch-fmt">{$convertState.datasetFiles.length}</span> file{$convertState.datasetFiles.length === 1 ? '' : 's'}?</p>
      <p class="switch-sub">This will empty the dataset and editor. Cannot be undone.</p>
      <div class="switch-actions">
        <button class="switch-btn switch-clear" onclick={confirmClearDataset}>clear all</button>
        <button class="switch-btn switch-cancel" onclick={() => (confirmingClearDataset = false)}>cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if pendingRemoveFileId}
  <div class="format-switch-overlay" role="dialog" aria-modal="true" aria-label="Remove file">
    <div class="format-switch-box">
      <p class="switch-title">Remove <span class="switch-fmt">{pendingRemoveFileName}</span>?</p>
      <p class="switch-sub">Removes this file from the dataset. Re-import to restore.</p>
      <div class="switch-actions">
        <button class="switch-btn switch-clear" onclick={confirmRemoveFile}>remove</button>
        <button class="switch-btn switch-cancel" onclick={() => (pendingRemoveFileId = null)}>cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if pendingPreset}
  <div class="format-switch-overlay" role="dialog" aria-modal="true" aria-labelledby="preset-switch-title">
    <div class="format-switch-box">
      <p class="switch-title" id="preset-switch-title">Regenerate output with <span class="switch-fmt">{getPreset(pendingPreset).name}</span>?</p>
      <p class="switch-sub">
        Switching the LLM model will <strong>regenerate the output</strong> against the new preset's rules.
        {#if pendingPresetErrorDelta > 0}
          This new preset would produce <strong>{pendingPresetErrorDelta}</strong> additional validation error{pendingPresetErrorDelta === 1 ? '' : 's'}.
        {:else if pendingPresetErrorDelta < 0}
          This new preset would resolve <strong>{-pendingPresetErrorDelta}</strong> existing validation error{pendingPresetErrorDelta === -1 ? '' : 's'}.
        {/if}
        Choose <em>cancel</em> to revert to the previous provider and model.
      </p>
      <div class="switch-actions">
        <button class="switch-btn switch-clear" onclick={confirmPresetSwitch}>yes, regenerate</button>
        <button class="switch-btn switch-cancel" onclick={cancelPresetSwitch}>cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if filenameDialog}
  <div class="format-switch-overlay" role="dialog" aria-modal="true" aria-label="Save file">
    <div class="format-switch-box">
      <p class="switch-title">Save <span class="switch-fmt">{filenameDialog.type === 'zip' ? 'zip' : 'combined'}</span> file</p>
      <p class="switch-sub">Enter a filename (extension added automatically)</p>
      <input
        class="filename-input"
        type="text"
        bind:value={filenameInput}
        onkeydown={(e) => { if (e.key === 'Enter') confirmFilenameDownload(); if (e.key === 'Escape') filenameDialog = null; }}
        spellcheck="false"
        autocomplete="off"
      />
      <p class="filename-preview">{(filenameInput.trim() || 'dataset') + '.' + filenameDialog.ext}</p>
      <div class="switch-actions">
        <button class="switch-btn switch-ok" onclick={confirmFilenameDownload}>download ↓</button>
        <button class="switch-btn switch-cancel" onclick={() => { filenameDialog = null; filenameInput = ''; }}>cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if copyFeedback}
  <div class="copy-toast" role="status" aria-live="polite">✓ {copyFeedback}</div>
{/if}

{#if showHfDialog}
  <HfHubPushDialog
    content={getActiveContent()}
    defaultFileName={`dataset.${$convertState.exportFormat === 'parquet' ? 'parquet' : $convertState.exportFormat === 'alpaca' || $convertState.exportFormat === 'sharegpt' ? 'jsonl' : $convertState.exportFormat}`}
    onclose={() => convertHfDialogOpen.set(false)}
  />
{/if}

<style>
  .convert-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .editor-area {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .editor-area.hidden {
    display: none;
  }

  .sample-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: color-mix(in srgb, var(--warn) 8%, var(--surface));
    border-bottom: 1px solid color-mix(in srgb, var(--warn) 25%, transparent);
    flex-shrink: 0;
  }

  .sample-info {
    font-size: 11px;
    color: var(--warn);
    flex: 1;
  }

  .sample-btn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    color: var(--warn);
  }

  .sample-btn:hover {
    background: color-mix(in srgb, var(--warn) 12%, transparent);
  }

  .format-switch-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .format-switch-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 20px 24px;
    min-width: 280px;
    max-width: 460px;
    width: calc(100vw - 32px);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .switch-title {
    font-size: 13px;
    color: var(--ink);
    margin: 0;
    line-height: 1.4;
    word-break: normal;
    overflow-wrap: anywhere;
  }

  .switch-fmt {
    color: var(--accent);
  }

  .switch-sub {
    font-size: 12px;
    color: var(--ink-dim);
    margin: 0;
    line-height: 1.5;
    word-break: normal;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .switch-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .switch-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    padding: 4px 10px;
    color: var(--ink-dim);
  }

  .switch-clear { color: var(--err); border-color: var(--err); }
  .switch-clear:hover { background: color-mix(in srgb, var(--err) 10%, transparent); }

  .switch-cancel:hover { background: var(--border); color: var(--ink); }

  .switch-ok { color: var(--accent); border-color: var(--accent); }
  .switch-ok:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  .filename-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 5px 8px;
    width: 100%;
    box-sizing: border-box;
    outline: none;
  }
  .filename-input:focus { border-color: var(--accent); }

  .filename-preview {
    font-size: 11px;
    color: var(--ink-dim);
    margin: 0;
    font-family: 'IBM Plex Mono', monospace;
  }

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
</style>
