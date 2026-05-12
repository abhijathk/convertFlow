<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { TokenAnalyzerResult } from '../../lib/utilities/tools/token-analyzer';
  import { selectFile, pendingJump } from '../../stores/editorState';
  import { setTab } from '../../stores/shellState';
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
  let contextWindow = $state('128k');
  let customWindowTokens = $state(4096);

  const WINDOWS = ['8k', '16k', '32k', '128k', '200k', '1M', 'custom'] as const;

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { contextWindow, customWindow: contextWindow === 'custom' ? customWindowTokens : 0 },
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

  function goToLine(fileId: string | null, line: number) {
    if (!fileId) return;
    selectFile(fileId);
    pendingJump.set({ fileId, line });
    setTab('editor');
  }

  function barWidth(tokens: number, max: number): number {
    if (max === 0) return 0;
    return Math.min(100, Math.round((tokens / max) * 100));
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

<div class="settings-row">
  <div class="setting-group">
    <label class="field-label" for="ctx-{meta.id}">Context window</label>
    <select id="ctx-{meta.id}" class="select-input" bind:value={contextWindow} onchange={() => (result = null)}>
      {#each WINDOWS as w}
        <option value={w}>{w === 'custom' ? 'Custom…' : w}</option>
      {/each}
    </select>
  </div>
  {#if contextWindow === 'custom'}
    <div class="setting-group">
      <label class="field-label" for="custom-window-{meta.id}">Custom token count</label>
      <input
        id="custom-window-{meta.id}"
        type="number"
        class="select-input"
        min="1"
        step="1"
        bind:value={customWindowTokens}
        oninput={() => (result = null)}
      />
    </div>
  {/if}
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Analyzing…' : 'Analyze Tokens'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as TokenAnalyzerResult}
    <div class="result-panel" role="region" aria-label="Token analysis results">
      <div class="summary-grid">
        <div class="stat"><span class="stat-value">{d.summary.min.toLocaleString()}</span><span class="stat-label">min</span></div>
        <div class="stat"><span class="stat-value">{d.summary.avg.toLocaleString()}</span><span class="stat-label">avg</span></div>
        <div class="stat"><span class="stat-value">{d.summary.p95.toLocaleString()}</span><span class="stat-label">p95</span></div>
        <div class="stat"><span class="stat-value">{d.summary.max.toLocaleString()}</span><span class="stat-label">max</span></div>
        <div class="stat warn"><span class="stat-value">{d.summary.totalWarning}</span><span class="stat-label">&gt;80% limit</span></div>
        <div class="stat over"><span class="stat-value">{d.summary.totalOver}</span><span class="stat-label">over limit</span></div>
      </div>

      {#if d.rows.length > 0}
        <div class="histogram">
          <span class="field-label">Distribution (first 100 rows)</span>
          <div class="bars">
            {#each d.rows.slice(0, 100) as row}
              <div
                class="bar bar-{row.status}"
                style="width:{barWidth(row.tokens, d.summary.max)}%"
                title="Line {row.line}: {row.tokens} tokens ({row.status})"
              ></div>
            {/each}
          </div>
        </div>
      {/if}

      {#if d.rows.filter(r => r.status !== 'ok').length > 0}
        <div class="issue-table">
          <span class="field-label">Warning / Over limit rows</span>
          <table class="table">
            <thead>
              <tr><th scope="col">Line</th><th scope="col">Tokens</th><th scope="col">Status</th>{#if toolState.prefillSourceFileId}<th scope="col"><span class="sr-only">Actions</span></th>{/if}</tr>
            </thead>
            <tbody>
              {#each d.rows.filter(r => r.status !== 'ok') as row}
                <tr class="row-{row.status}">
                  <td class="mono">{row.line}</td>
                  <td class="mono">{row.tokens.toLocaleString()}</td>
                  <td><span class="status-badge status-{row.status}">{row.status}</span></td>
                  {#if toolState.prefillSourceFileId}
                    <td>
                      <button class="go-btn" onclick={() => goToLine(toolState.prefillSourceFileId, row.line)}>
                        Go to line
                      </button>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if d.rows.length > 0}
        <p class="all-ok">All rows within context window limits.</p>
      {/if}
    </div>
  {:else if !result.ok}
    <div class="error-panel" role="alert">{result.error ?? 'An error occurred.'}</div>
  {/if}
{/if}

<style>
  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }
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
  .settings-row { display: flex; gap: 16px; }
  .setting-group { display: flex; flex-direction: column; }
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
    gap: 14px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
  }
  .stat { display: flex; flex-direction: column; gap: 3px; }
  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .stat-label {
    font-size: 10px;
    color: var(--ink-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .stat.warn .stat-value { color: #f59e0b; }
  .stat.over .stat-value { color: #ef4444; }
  .histogram { display: flex; flex-direction: column; gap: 6px; }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px;
    max-height: 120px;
    overflow-y: auto;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    min-width: 2px;
    transition: width 0.1s;
  }
  .bar-ok { background: color-mix(in srgb, var(--accent) 60%, transparent); }
  .bar-warning { background: #f59e0b; }
  .bar-over { background: #ef4444; }
  .issue-table { display: flex; flex-direction: column; gap: 6px; }
  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .table th {
    text-align: left;
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  .table td {
    padding: 5px 8px;
    color: var(--ink);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  .mono { font-family: var(--font-mono, ui-monospace, monospace); }
  .status-badge {
    font-size: 10px;
    font-weight: 700;
    border-radius: 3px;
    padding: 1px 6px;
    text-transform: uppercase;
  }
  .status-warning {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
  }
  .status-over {
    color: #ef4444;
    background: color-mix(in srgb, #ef4444 12%, transparent);
  }
  .go-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    white-space: nowrap;
  }
  .go-btn:hover { color: var(--ink); }
  .all-ok { font-size: 13px; color: #22c55e; margin: 0; }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
  @media (max-width: 500px) {
    .summary-grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
