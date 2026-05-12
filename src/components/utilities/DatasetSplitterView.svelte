<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { DatasetSplitterResult } from '../../lib/utilities/tools/dataset-splitter';
  import ResultActions from './ResultActions.svelte';
  import FileUploadButton from './FileUploadButton.svelte';
  import EditorSelectionButton from './EditorSelectionButton.svelte';

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

  let trainPct = $state(80);
  let valPct = $state(10);
  let testPct = $state(10);
  let seed = $state('');

  let sumError = $derived(Math.round(trainPct + valPct + testPct) !== 100 ? `Percentages sum to ${trainPct + valPct + testPct} — must equal 100` : '');

  async function run() {
    if (sumError) return;
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { trainPct, valPct, testPct, seed },
    });
    running = false;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function handleUpload(content: string, _filename: string, _truncated: boolean) {
    setToolInput(meta.id, content);
    result = null;
  }

  function basename(): string {
    if (!toolState.prefillSourceFileId) return 'dataset';
    const name = toolState.prefillSourceFileId.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    return name || 'dataset';
  }
</script>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">JSONL Input</label>
    <div class="action-buttons">
      <FileUploadButton accept=".jsonl,.txt" onload={handleUpload} />
      <EditorSelectionButton onload={handleUpload} />
    </div>
  </div>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste JSONL here — one JSON object per line…"
    spellcheck="false"
    rows="8"
  ></textarea>
</div>

<div class="settings-panel">
  <div class="pct-row">
    <div class="pct-field">
      <label class="field-label" for="train-{meta.id}">Train %</label>
      <input id="train-{meta.id}" class="num-input" type="number" min="0" max="100" bind:value={trainPct} oninput={() => (result = null)} />
    </div>
    <div class="pct-field">
      <label class="field-label" for="val-{meta.id}">Val %</label>
      <input id="val-{meta.id}" class="num-input" type="number" min="0" max="100" bind:value={valPct} oninput={() => (result = null)} />
    </div>
    <div class="pct-field">
      <label class="field-label" for="test-{meta.id}">Test %</label>
      <input id="test-{meta.id}" class="num-input" type="number" min="0" max="100" bind:value={testPct} oninput={() => (result = null)} />
    </div>
    <div class="seed-field">
      <label class="field-label" for="seed-{meta.id}">Seed (optional)</label>
      <input id="seed-{meta.id}" class="text-input" type="text" bind:value={seed} placeholder="leave blank for random" oninput={() => (result = null)} />
    </div>
  </div>
  {#if sumError}
    <p class="inline-error" role="alert">{sumError}</p>
  {/if}
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !!sumError || !toolState.primaryInput}>
    {running ? 'Splitting…' : 'Split Dataset'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as DatasetSplitterResult}
    <div class="split-cards">
      {#each ([['train', d.train, d.counts.train], ['val', d.val, d.counts.val], ['test', d.test, d.counts.test]] as const) as [split, content, count]}
        <div class="split-card">
          <div class="split-header">
            <span class="split-name">{split}</span>
            <span class="split-count">{count} lines</span>
          </div>
          <textarea class="output-box" readonly value={content} rows="5"></textarea>
          <div class="card-actions">
            <ResultActions
              text={content}
              showSendToEditor={true}
              showSendToConvert={true}
              showSendToChunk={false}
              editorFileName="{basename()}_{split}.jsonl"
              {sendToEditor}
              {sendToConvert}
              {sendToChunk}
            />
          </div>
        </div>
      {/each}
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
  .field-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .field-label-row .field-label { margin-bottom: 0; }
  .action-buttons { display: flex; gap: 6px; }
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
  .settings-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pct-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .pct-field { display: flex; flex-direction: column; width: 80px; }
  .seed-field { display: flex; flex-direction: column; flex: 1; min-width: 140px; }
  .num-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;
    width: 100%;
    outline: none;
    box-sizing: border-box;
  }
  .num-input:focus { border-color: var(--accent); }
  .text-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;
    width: 100%;
    outline: none;
    box-sizing: border-box;
  }
  .text-input:focus { border-color: var(--accent); }
  .text-input::placeholder { color: var(--muted); font-style: italic; }
  .inline-error {
    font-size: 12px;
    color: #ef4444;
    margin: 0;
  }
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
  .split-cards { display: flex; flex-direction: column; gap: 12px; }
  .split-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .split-header { display: flex; align-items: center; gap: 10px; }
  .split-name {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink);
  }
  .split-count {
    font-size: 11px;
    color: var(--ink-dim);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-radius: 3px;
    padding: 1px 7px;
    font-variant-numeric: tabular-nums;
  }
  .output-box {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 10px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    min-height: 80px;
  }
  .card-actions { margin-top: 0; }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
</style>
