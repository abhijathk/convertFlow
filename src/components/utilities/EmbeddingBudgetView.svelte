<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { EmbeddingBudgetResult } from '../../lib/utilities/tools/embedding-budget';
  import embeddersJson from '../../data/embedders.json';
  import FileUploadButton, { TEXT_ACCEPT } from './FileUploadButton.svelte';
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
  let chunkSize = $state(512);
  let embedderId = $state('openai-text-embedding-3-small');

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { chunkSize, embedderId },
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

  function formatCost(cost: number): string {
    if (cost === 0) return '$0.00 (free)';
    if (cost < 0.001) return '< $0.001';
    if (cost < 10) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }
</script>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">Text / Chunks Input</label>
    <div class="action-buttons">
      <FileUploadButton accept={TEXT_ACCEPT} onload={handleUpload} />
      <EditorSelectionButton onload={handleUpload} />
    </div>
  </div>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste text, raw chunks, or JSONL here…"
    spellcheck="false"
    rows="8"
  ></textarea>
</div>

<div class="settings-panel">
  <div class="settings-row">
    <div class="setting-group">
      <label class="field-label" for="chunk-{meta.id}">Chunk size (tokens)</label>
      <input
        id="chunk-{meta.id}"
        class="num-input"
        type="number"
        min="1"
        max="8192"
        bind:value={chunkSize}
        oninput={() => (result = null)}
      />
    </div>
    <div class="setting-group" style="flex:1">
      <label class="field-label" for="embedder-{meta.id}">Embedder</label>
      <select id="embedder-{meta.id}" class="select-input" bind:value={embedderId} onchange={() => (result = null)}>
        {#each embeddersJson as e}
          <option value={e.id}>{e.provider} / {e.name}</option>
        {/each}
      </select>
    </div>
  </div>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Estimating…' : 'Estimate Budget'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as EmbeddingBudgetResult}
    <div class="result-panel" role="region" aria-label="Embedding budget results">
      <div class="stat-cards">
        <div class="stat-card">
          <span class="stat-value">{d.totalChars.toLocaleString()}</span>
          <span class="stat-label">characters</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{formatTokens(d.totalTokens)}</span>
          <span class="stat-label">tokens (approx)</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{d.numChunks.toLocaleString()}</span>
          <span class="stat-label">chunks @ {chunkSize}t</span>
        </div>
        <div class="stat-card accent">
          <span class="stat-value">{formatCost(d.selectedCost)}</span>
          <span class="stat-label">estimated cost</span>
        </div>
      </div>

      <div class="comparison-section">
        <span class="field-label">Cost across all embedders</span>
        <table class="cmp-table">
          <thead>
            <tr><th>Provider</th><th>Model</th><th>$/M tokens</th><th>Cost</th></tr>
          </thead>
          <tbody>
            {#each d.comparison as row}
              <tr class:active={row.id === d.selectedEmbedderId}>
                <td>{row.provider}</td>
                <td class="mono">{row.name}</td>
                <td class="mono">{row.pricePerMTokens === 0 ? 'free' : `$${row.pricePerMTokens}`}</td>
                <td class="mono cost">{formatCost(row.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
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
  }
  .settings-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .setting-group { display: flex; flex-direction: column; }
  .num-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;
    width: 100px;
    outline: none;
  }
  .num-input:focus { border-color: var(--accent); }
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
    width: 100%;
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
    gap: 16px;
  }
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .stat-card.accent { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .stat-card.accent .stat-value { color: var(--accent); }
  .stat-label {
    font-size: 10px;
    color: var(--ink-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .comparison-section { display: flex; flex-direction: column; gap: 6px; }
  .cmp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .cmp-table th {
    text-align: left;
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  .cmp-table td {
    padding: 5px 8px;
    color: var(--ink-dim);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  }
  .cmp-table tr.active td { color: var(--ink); font-weight: 600; }
  .mono { font-family: var(--font-mono, ui-monospace, monospace); }
  .cost { color: var(--accent); }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
  @media (max-width: 500px) {
    .stat-cards { grid-template-columns: repeat(2, 1fr); }
  }
</style>
