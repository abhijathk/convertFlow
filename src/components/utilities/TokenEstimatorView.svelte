<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput, setToolPrefilled, selectedUtilityId } from '../../stores/utilitiesState';
  import { getActiveFile } from '../../stores/editorState';
  import ResultActions from './ResultActions.svelte';
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

  async function run() {
    running = true;
    result = await runUtility(meta.id, { input: toolState.primaryInput });
    running = false;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function loadFullFile() {
    const file = getActiveFile();
    if (!file) return;
    setToolPrefilled(meta.id, file.content, file.id, false);
    result = null;
  }

  function handleUpload(content: string, _filename: string, _truncated: boolean) {
    setToolInput(meta.id, content);
    result = null;
  }

  function summaryText(d: { approximate: number; chars: number; words: number; lines: number }): string {
    return `Tokens (approx): ${d.approximate.toLocaleString()}\nCharacters: ${d.chars.toLocaleString()}\nWords: ${d.words.toLocaleString()}\nLines: ${d.lines.toLocaleString()}`;
  }
</script>

{#if toolState.prefillTruncated}
  <div class="truncation-strip" role="alert">
    File too large to auto-load — showing first 100KB.
    <button class="load-full-btn" onclick={loadFullFile}>Load full file</button>
  </div>
{/if}

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">Input</label>
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
    placeholder="Paste or type text here…"
    spellcheck="false"
    rows="10"
  ></textarea>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running}>
    {running ? 'Running…' : 'Estimate'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as { approximate: number; chars: number; words: number; lines: number }}
    <div class="result-panel" role="region" aria-label="Token estimation results">
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{d.approximate.toLocaleString()}</span>
          <span class="stat-label">tokens (approx)</span>
        </div>
        <div class="stat">
          <span class="stat-value">{d.chars.toLocaleString()}</span>
          <span class="stat-label">characters</span>
        </div>
        <div class="stat">
          <span class="stat-value">{d.words.toLocaleString()}</span>
          <span class="stat-label">words</span>
        </div>
        <div class="stat">
          <span class="stat-value">{d.lines.toLocaleString()}</span>
          <span class="stat-label">lines</span>
        </div>
      </div>
      <div class="result-actions-row">
        <button class="secondary-btn" onclick={() => { setToolInput('cost-calculator', toolState.primaryInput); selectedUtilityId.set('cost-calculator'); }}>
          Use in Cost Calculator →
        </button>
      </div>
      <ResultActions
        text={summaryText(d)}
        showSendToEditor={false}
        showSendToConvert={false}
        showSendToChunk={false}
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
  .truncation-strip {
    background: color-mix(in srgb, #f59e0b 15%, transparent);
    border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .load-full-btn {
    background: none;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink);
    white-space: nowrap;
  }
  .load-full-btn:hover { background: var(--border); }
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
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .stat { display: flex; flex-direction: column; gap: 3px; }
  .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .stat-label {
    font-size: 11px;
    color: var(--ink-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .result-actions-row { display: flex; gap: 8px; }
  .secondary-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    white-space: nowrap;
  }
  .secondary-btn:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
  @media (max-width: 500px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
