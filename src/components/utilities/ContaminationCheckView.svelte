<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { ContaminationCheckResult } from '../../lib/utilities/tools/contamination-check';
  import FileUploadButton from './FileUploadButton.svelte';
  import EditorSelectionButton from './EditorSelectionButton.svelte';

  interface Props {
    meta: UtilityMeta;
    sendToEditor: (name: string, content: string) => void;
    sendToConvert: (content: string) => void;
    sendToChunk: (content: string) => void;
  }

  let { meta, sendToEditor: _sendToEditor, sendToConvert: _sendToConvert, sendToChunk: _sendToChunk }: Props = $props();

  let toolState = $derived($utilitiesState[meta.id] ?? { primaryInput: '', autoPrefilled: false, prefillSourceFileId: null, prefillTruncated: false });
  let result = $state<UtilityResult | null>(null);
  let running = $state(false);

  async function run() {
    running = true;
    result = await runUtility(meta.id, { input: toolState.primaryInput });
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

  function totalContaminated(d: ContaminationCheckResult): number {
    return Object.values(d.summary).reduce((a, b) => a + b, 0);
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

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Scanning…' : 'Check for Contamination'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as ContaminationCheckResult}
    {@const contamTotal = totalContaminated(d)}
    <div class="result-panel" role="region" aria-label="Contamination check results">
      <div class="stats-row">
        <span class="stat-pill">Total rows: {d.totalRows}</span>
        <span class="stat-pill {contamTotal > 0 ? 'warn' : 'ok'}">Flagged hits: {contamTotal}</span>
      </div>

      <div class="benchmark-grid">
        {#each Object.entries(d.summary) as [bm, count]}
          <div class="benchmark-cell {count > 0 ? 'flagged' : ''}">
            <span class="bm-name">{bm}</span>
            <span class="bm-count">{count}</span>
          </div>
        {/each}
      </div>

      {#if d.contaminatedRows.length > 0}
        <div class="hits-header">
          <span class="section-label">First {d.contaminatedRows.length} flagged rows</span>
          {#if contamTotal > d.contaminatedRows.length}
            <span class="cap-note">(showing first {d.contaminatedRows.length} of {contamTotal} total hits)</span>
          {/if}
        </div>
        <ul class="hit-list">
          {#each d.contaminatedRows as hit}
            <li class="hit-item">
              <div class="hit-meta">
                <span class="hit-line">line {hit.line}</span>
                <span class="hit-bm">{hit.benchmark}</span>
              </div>
              <div class="hit-ngram">"{hit.ngram}"</div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="no-hits">No benchmark contamination detected.</p>
      {/if}

      <p class="disclaimer">
        Uses phrase-matching against representative signatures from MMLU, GSM8K, HellaSwag, HumanEval, IFEval, and ARC.
        Low false-negative rate for verbatim copies; does not catch paraphrased contamination.
      </p>
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
  .stat-pill.warn {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    border-color: color-mix(in srgb, #f59e0b 30%, transparent);
  }
  .stat-pill.ok {
    color: #22c55e;
    background: color-mix(in srgb, #22c55e 10%, transparent);
    border-color: color-mix(in srgb, #22c55e 25%, transparent);
  }
  .benchmark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
  }
  .benchmark-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--accent) 5%, transparent);
    border: 1px solid var(--border);
    border-radius: 4px;
    gap: 2px;
  }
  .benchmark-cell.flagged {
    background: color-mix(in srgb, #f59e0b 10%, transparent);
    border-color: color-mix(in srgb, #f59e0b 35%, transparent);
  }
  .bm-name {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .bm-count {
    font-size: 18px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .benchmark-cell.flagged .bm-count { color: #f59e0b; }
  .hits-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .section-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .cap-note {
    font-size: 11px;
    color: var(--ink-dim);
    font-style: italic;
  }
  .hit-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    max-height: 320px;
    overflow-y: auto;
  }
  .hit-item {
    background: color-mix(in srgb, #f59e0b 8%, transparent);
    border-radius: 3px;
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .hit-meta {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .hit-line {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
  }
  .hit-bm {
    font-size: 11px;
    font-weight: 700;
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 15%, transparent);
    border-radius: 2px;
    padding: 1px 5px;
  }
  .hit-ngram {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--ink);
  }
  .no-hits {
    font-size: 13px;
    color: #22c55e;
    margin: 0;
  }
  .disclaimer {
    font-size: 11px;
    color: var(--ink-dim);
    margin: 0;
    font-style: italic;
    line-height: 1.4;
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
