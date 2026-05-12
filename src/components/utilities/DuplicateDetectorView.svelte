<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { DuplicateDetectorResult, DupMode } from '../../lib/utilities/tools/duplicate-detector';
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
  let mode = $state<DupMode>('exact');
  let fieldPath = $state('messages[0].content');

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { mode, fieldPath },
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

  function sendUniqueToEditor(d: DuplicateDetectorResult) {
    const lines = toolState.primaryInput.split('\n').filter(l => l.trim() !== '');
    const dupLineNums = new Set(d.duplicates.flatMap(g => g.lines.slice(1)));
    const unique = lines.filter((_, i) => !dupLineNums.has(i + 1)).join('\n');
    sendToEditor('unique.jsonl', unique);
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
    <label class="field-label" for="mode-{meta.id}">Mode</label>
    <select id="mode-{meta.id}" class="select-input" bind:value={mode} onchange={() => (result = null)}>
      <option value="exact">Exact</option>
      <option value="normalized">Normalized (trim + lowercase)</option>
      <option value="semantic">Semantic (Jaccard ≥ 85%)</option>
      <option value="field">By field</option>
    </select>
  </div>
  {#if mode === 'field'}
    <div class="setting-group">
      <label class="field-label" for="field-{meta.id}">JSON path</label>
      <input id="field-{meta.id}" class="text-input" type="text" bind:value={fieldPath} placeholder="messages[0].content" oninput={() => (result = null)} />
    </div>
  {/if}
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Scanning…' : 'Detect Duplicates'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as DuplicateDetectorResult}
    <div class="result-panel" role="region" aria-label="Duplicate detection results">
      <div class="stats-row">
        <span class="stat-pill">Total: {d.total}</span>
        <span class="stat-pill">Unique: {d.unique}</span>
        <span class="stat-pill {d.duplicates.length > 0 ? 'warn' : ''}">Dup groups: {d.duplicates.length}{d.cappedAt ? ` (capped at 200 of ${d.cappedAt})` : ''}</span>
      </div>

      {#if d.duplicates.length > 0}
        <button class="secondary-btn" onclick={() => sendUniqueToEditor(d)}>Send unique → Editor</button>

        <ul class="dup-list">
          {#each d.duplicates as group}
            <li class="dup-item">
              <div class="dup-preview">{group.value.slice(0, 120)}{group.value.length > 120 ? '…' : ''}</div>
              <div class="dup-meta">
                <span class="dup-occ">{group.occurrences}×</span>
                <span class="dup-lines">lines {group.lines.join(', ')}</span>
              </div>
            </li>
          {/each}
        </ul>
        {#if d.cappedAt}
          <p class="cap-note">+ {d.cappedAt - 200} more duplicate groups not shown</p>
        {/if}
      {:else}
        <p class="no-dups">No duplicates found.</p>
      {/if}
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
  .settings-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
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
  .text-input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    outline: none;
    min-width: 200px;
  }
  .text-input:focus { border-color: var(--accent); }
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
  .secondary-btn {
    align-self: flex-start;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    transition: color 0.1s, border-color 0.1s;
  }
  .secondary-btn:hover { color: var(--ink); border-color: var(--ink-dim); }
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
  .dup-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 320px;
    overflow-y: auto;
  }
  .dup-item {
    background: color-mix(in srgb, #ef4444 8%, transparent);
    border-radius: 3px;
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dup-preview {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--ink);
    word-break: break-all;
  }
  .dup-meta { display: flex; gap: 10px; align-items: center; }
  .dup-occ {
    font-size: 11px;
    font-weight: 700;
    color: #ef4444;
    white-space: nowrap;
  }
  .dup-lines {
    font-size: 11px;
    color: var(--ink-dim);
  }
  .no-dups {
    font-size: 13px;
    color: #22c55e;
    margin: 0;
  }
  .cap-note {
    font-size: 11px;
    color: var(--ink-dim);
    margin: 0;
    font-style: italic;
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
