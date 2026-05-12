<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { JsonlRepairResult, LineRepair } from '../../lib/utilities/tools/jsonl-repair';
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
  let showAll = $state(false);
  let keepFailed = $state(false);

  async function run() {
    running = true;
    result = await runUtility(meta.id, { input: toolState.primaryInput, options: { keepFailed } });
    showAll = false;
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

  function statusColor(status: LineRepair['status']): string {
    if (status === 'ok') return 'var(--ink-dim)';
    if (status === 'repaired') return '#22c55e';
    return '#ef4444';
  }

  function statusGlyph(status: LineRepair['status']): string {
    if (status === 'ok') return '·';
    if (status === 'repaired') return '✓';
    return '×';
  }
</script>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">Input</label>
    <div class="action-buttons">
      <FileUploadButton accept=".jsonl,.json,.txt" onload={handleUpload} />
      <EditorSelectionButton onload={handleUpload} />
    </div>
  </div>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste malformed JSONL here…"
    spellcheck="false"
    rows="10"
  ></textarea>
</div>

<div class="settings-row">
  <label class="toggle-label" title="Include unrecoverable lines as-is in the output so you can fix them manually in the Editor">
    <input type="checkbox" bind:checked={keepFailed} onchange={() => (result = null)} />
    <span class="toggle-name">Keep failed lines</span>
  </label>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Repairing…' : 'Repair'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as JsonlRepairResult}
    <div class="stats-bar">
      <span class="stat">{d.stats.total} lines</span>
      <span class="sep">·</span>
      <span class="stat ok">{d.stats.ok} ok</span>
      {#if d.stats.repaired > 0}
        <span class="sep">·</span>
        <span class="stat repaired">{d.stats.repaired} repaired</span>
      {/if}
      {#if d.stats.failed > 0}
        <span class="sep">·</span>
        <span class="stat failed">{d.stats.failed} failed {keepFailed ? '(kept as-is)' : '(excluded)'}</span>
      {/if}
    </div>

    {#if d.stats.repaired > 0 || d.stats.failed > 0}
      <div class="lines-panel">
        <div class="lines-header">
          <span class="field-label" style="margin-bottom:0">Line report</span>
          <button class="toggle-btn" onclick={() => (showAll = !showAll)}>
            {showAll ? 'hide ok lines' : 'show all lines'}
          </button>
        </div>
        <div class="lines-list">
          {#each d.lines as ln}
            {#if showAll || ln.status !== 'ok'}
              <div class="line-row" style="--sc:{statusColor(ln.status)}">
                <span class="line-glyph">{statusGlyph(ln.status)}</span>
                <span class="line-num">L{ln.lineNum}</span>
                {#if ln.fixes.length > 0}
                  <span class="line-fixes">{ln.fixes.join(', ')}</span>
                {/if}
                {#if ln.status === 'failed'}
                  <span class="line-preview" title={ln.original}>{ln.original.slice(0, 80)}{ln.original.length > 80 ? '…' : ''}</span>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    {#if d.stats.repaired > 0 || d.stats.ok > 0}
      <div class="output-section">
        <label class="field-label">Repaired Output</label>
        <textarea class="primary-input output-box" readonly value={d.output} rows="10"></textarea>
        <ResultActions
          text={d.output}
          showSendToEditor={true}
          showSendToConvert={true}
          showSendToChunk={true}
          editorFileName="repaired.jsonl"
          {sendToEditor}
          {sendToConvert}
          {sendToChunk}
        />
      </div>
    {/if}
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
    min-height: 160px;
  }
  .primary-input:focus { border-color: var(--accent); }
  .output-box { min-height: 120px; }
  .settings-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-family: inherit;
  }
  .toggle-label input[type='checkbox'] {
    accent-color: var(--accent);
    cursor: pointer;
    width: 13px;
    height: 13px;
    margin: 0;
  }
  .toggle-name {
    font-size: 12px;
    color: var(--ink);
    user-select: none;
  }
  .run-row { display: flex; gap: 8px; }
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

  .stats-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
  }
  .stat { color: var(--ink-dim); }
  .stat.ok { color: var(--ink-dim); }
  .stat.repaired { color: #22c55e; font-weight: 600; }
  .stat.failed { color: #ef4444; font-weight: 600; }
  .sep { color: var(--muted); }

  .lines-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .lines-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .toggle-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
  }
  .toggle-btn:hover { color: var(--ink); border-color: var(--ink-dim); }

  .lines-list {
    max-height: 240px;
    overflow-y: auto;
  }
  .line-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .line-row:last-child { border-bottom: none; }
  .line-glyph { color: var(--sc); font-weight: 700; width: 10px; flex-shrink: 0; }
  .line-num { color: var(--sc); font-weight: 600; flex-shrink: 0; }
  .line-fixes { color: var(--ink-dim); font-style: italic; flex: 1; min-width: 0; }
  .line-preview {
    color: #ef4444;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .output-section { display: flex; flex-direction: column; gap: 6px; }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
</style>
