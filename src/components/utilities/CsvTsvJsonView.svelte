<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { CsvTsvJsonResult, CsvTsvJsonFromFormat, CsvTsvJsonToFormat } from '../../lib/utilities/tools/csv-tsv-json';
  import ResultActions from './ResultActions.svelte';

  interface Props {
    meta: UtilityMeta;
    sendToEditor: (name: string, content: string) => void;
    sendToConvert: (content: string) => void;
    sendToChunk: (content: string) => void;
  }

  let { meta, sendToEditor, sendToConvert, sendToChunk }: Props = $props();

  let toolState = $derived($utilitiesState[meta.id] ?? { primaryInput: '', autoPrefilled: false, prefillSourceFileId: null, prefillTruncated: false });
  let result = $state<UtilityResult | null>(null);
  let running = $state(false);
  let fromFmt = $state<CsvTsvJsonFromFormat>('auto');
  let toFmt = $state<CsvTsvJsonToFormat>('jsonl');

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { from: fromFmt, to: toFmt },
    });
    running = false;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function outputExtension(fmt: CsvTsvJsonToFormat): string {
    if (fmt === 'jsonl') return 'jsonl';
    if (fmt === 'json') return 'json';
    if (fmt === 'csv') return 'csv';
    return 'tsv';
  }
</script>

<div class="input-area">
  <label class="field-label" for="input-{meta.id}">Input</label>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste CSV, TSV, JSON, or JSONL here…"
    spellcheck="false"
    rows="8"
  ></textarea>
</div>

<div class="settings-row">
  <div class="setting-group">
    <label class="field-label" for="from-{meta.id}">From</label>
    <select id="from-{meta.id}" class="select-input" bind:value={fromFmt} onchange={() => (result = null)}>
      <option value="auto">Auto-detect</option>
      <option value="csv">CSV</option>
      <option value="tsv">TSV</option>
      <option value="json">JSON / JSONL</option>
    </select>
  </div>
  <div class="arrow-sep" aria-hidden="true">→</div>
  <div class="setting-group">
    <label class="field-label" for="to-{meta.id}">To</label>
    <select id="to-{meta.id}" class="select-input" bind:value={toFmt} onchange={() => (result = null)}>
      <option value="jsonl">JSONL</option>
      <option value="json">JSON</option>
      <option value="csv">CSV</option>
      <option value="tsv">TSV</option>
    </select>
  </div>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Converting…' : 'Convert'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as CsvTsvJsonResult}
    <div class="result-panel" role="region" aria-label="Conversion results">
      <div class="stats-row">
        <span class="stat-pill">detected: {d.detectedFrom}</span>
        <span class="stat-pill">{d.rowCount} rows</span>
      </div>
      <textarea class="output-box" readonly value={d.output} rows="10"></textarea>
      <ResultActions
        text={d.output}
        showSendToEditor={true}
        showSendToConvert={true}
        showSendToChunk={false}
        editorFileName="converted.{outputExtension(toFmt)}"
        {sendToEditor}
        {sendToConvert}
        {sendToChunk}
      />
    </div>
  {:else if !result.ok}
    <div class="error-panel" role="alert">{result.error ?? 'An error occurred.'}</div>
  {/if}
{/if}

<style>
  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }
  .input-area { display: flex; flex-direction: column; }
  .primary-input {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 12px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    min-height: 120px;
  }
  .primary-input:focus { border-color: var(--accent); }
  .settings-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .setting-group { display: flex; flex-direction: column; }
  .arrow-sep {
    font-size: 16px;
    color: var(--ink-dim);
    padding-bottom: 2px;
    align-self: flex-end;
  }
  .select-input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    outline: none;
    cursor: pointer;
  }
  .select-input:focus { border-color: var(--accent); }
  .run-row { display: flex; }
  .run-btn {
    background: var(--accent);
    border: none;
    border-radius: 4px;
    padding: 7px 20px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    transition: opacity 0.1s;
  }
  .run-btn:hover:not(:disabled) { opacity: 0.85; }
  .run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .result-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .stats-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .stat-pill {
    font-size: 11px;
    color: var(--ink-dim);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-radius: 3px;
    padding: 2px 8px;
    font-variant-numeric: tabular-nums;
  }
  .output-box {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 12px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    min-height: 160px;
  }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
</style>
