<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { JsonValidatorResult, ValidatorMode } from '../../lib/utilities/tools/json-validator';
  import { selectFile } from '../../stores/editorState';
  import { pendingJump } from '../../stores/editorState';
  import { setTab } from '../../stores/shellState';
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
  let mode = $state<ValidatorMode>('auto');
  let transformedOutput = $state('');
  let resultSourceFileId = $state<string | null>(null);

  async function run() {
    running = true;
    resultSourceFileId = toolState.prefillSourceFileId;
    result = await runUtility(meta.id, { input: toolState.primaryInput, options: { mode } });
    transformedOutput = '';
    running = false;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
    resultSourceFileId = null;
    transformedOutput = '';
  }

  function handleUpload(content: string, _filename: string, _truncated: boolean) {
    setToolInput(meta.id, content);
    result = null;
    resultSourceFileId = null;
    transformedOutput = '';
  }

  function prettyPrint() {
    try {
      const parsed = JSON.parse(toolState.primaryInput);
      transformedOutput = JSON.stringify(parsed, null, 2);
    } catch {
      transformedOutput = '';
    }
  }

  function minify() {
    try {
      const parsed = JSON.parse(toolState.primaryInput);
      transformedOutput = JSON.stringify(parsed);
    } catch {
      transformedOutput = '';
    }
  }

  function goToLine(fileId: string | null, line: number) {
    if (!fileId) return;
    selectFile(fileId);
    pendingJump.set({ fileId, line });
    setTab('editor');
  }
</script>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">Input</label>
    <div class="action-buttons">
      <FileUploadButton accept=".json,.jsonl,.txt,application/json" onload={handleUpload} />
      <EditorSelectionButton onload={handleUpload} />
    </div>
  </div>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste JSON or JSONL here…"
    spellcheck="false"
    rows="10"
  ></textarea>
</div>

<div class="settings-row">
  <div class="setting-group">
    <label class="field-label" for="mode-{meta.id}">Mode</label>
    <select id="mode-{meta.id}" class="select-input" bind:value={mode} onchange={() => (result = null)}>
      <option value="auto">Auto-detect</option>
      <option value="json">JSON</option>
      <option value="jsonl">JSONL</option>
    </select>
  </div>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running}>
    {running ? 'Validating…' : 'Validate'}
  </button>
  <button class="secondary-btn" onclick={prettyPrint} disabled={!toolState.primaryInput}>Pretty-print</button>
  <button class="secondary-btn" onclick={minify} disabled={!toolState.primaryInput}>Minify</button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as JsonValidatorResult}
    <div class="result-panel" role="region" aria-label="Validation results">
      {#if d.valid}
        <div class="valid-badge">Valid {d.mode.toUpperCase()}</div>
        {#if d.mode === 'jsonl' && d.totalLines !== undefined}
          <p class="meta-text">{d.totalLines} lines · {d.validLines} valid</p>
        {/if}
      {:else}
        <div class="invalid-badge">Invalid {d.mode.toUpperCase()}</div>
        <ul class="error-list">
          {#each d.errors as err}
            <li class="error-item">
              <span class="error-loc">Line {err.line}{err.column > 1 ? `, col ${err.column}` : ''}</span>
              <span class="error-msg">{err.message}</span>
              {#if resultSourceFileId}
                <button
                  class="go-to-btn"
                  onclick={() => goToLine(resultSourceFileId, err.line)}
                >
                  ↗ line {err.line} in Editor
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else if !result.ok}
    <div class="error-panel" role="alert">{result.error ?? 'An error occurred.'}</div>
  {/if}
{/if}

{#if transformedOutput}
  <div class="output-section">
    <label class="field-label">Output</label>
    <textarea class="primary-input output-box" readonly value={transformedOutput} rows="10"></textarea>
    <ResultActions
      text={transformedOutput}
      showSendToEditor={true}
      showSendToConvert={true}
      showSendToChunk={false}
      editorFileName="output.json"
      {sendToEditor}
      {sendToConvert}
      {sendToChunk}
    />
  </div>
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
  .run-row { display: flex; gap: 8px; flex-wrap: wrap; }
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
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 7px 14px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink-dim);
    transition: color 0.1s, border-color 0.1s;
  }
  .secondary-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-dim); }
  .secondary-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .result-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .valid-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #22c55e;
  }
  .valid-badge::before { content: '✓'; }
  .invalid-badge {
    font-size: 13px;
    font-weight: 700;
    color: #ef4444;
  }
  .meta-text { font-size: 12px; color: var(--ink-dim); margin: 0; }
  .error-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .error-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    padding: 6px 8px;
    background: color-mix(in srgb, #ef4444 8%, transparent);
    border-radius: 3px;
  }
  .error-loc { font-weight: 700; color: #ef4444; white-space: nowrap; }
  .error-msg { color: var(--ink); flex: 1; }
  .go-to-btn {
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
  .go-to-btn:hover { color: var(--ink); }
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
