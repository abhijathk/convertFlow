<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { TextTransformerResult, TextTransformerOptions } from '../../lib/utilities/tools/text-transformer';
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

  let trim = $state(true);
  let dedupeLines = $state(false);
  let normalizeQuotes = $state(false);
  let removeBlankLines = $state(false);
  let caseMode = $state<TextTransformerOptions['caseMode']>('none');

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { trim, dedupeLines, normalizeQuotes, removeBlankLines, caseMode },
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
</script>

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
    rows="8"
  ></textarea>
</div>

<div class="settings-panel">
  <span class="field-label">Transforms</span>
  <div class="checkbox-grid">
    <label class="check-label">
      <input type="checkbox" bind:checked={trim} onchange={() => (result = null)} />
      Trim trailing whitespace
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={dedupeLines} onchange={() => (result = null)} />
      Deduplicate lines
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={normalizeQuotes} onchange={() => (result = null)} />
      Normalize quotes &amp; dashes
    </label>
    <label class="check-label">
      <input type="checkbox" bind:checked={removeBlankLines} onchange={() => (result = null)} />
      Remove blank lines
    </label>
  </div>
  <div class="case-row">
    <span class="field-label" style="margin-bottom:0">Case</span>
    <div class="radio-group">
      {#each (['none', 'lower', 'upper', 'title'] as const) as c}
        <label class="radio-label">
          <input type="radio" name="case-{meta.id}" value={c} bind:group={caseMode} onchange={() => (result = null)} />
          {c === 'none' ? 'No change' : c.charAt(0).toUpperCase() + c.slice(1)}
        </label>
      {/each}
    </div>
  </div>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running}>
    {running ? 'Transforming…' : 'Transform'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as TextTransformerResult}
    <div class="result-panel" role="region" aria-label="Transformation results">
      <div class="stats-row">
        <span class="stat-pill">{d.stats.charsBefore.toLocaleString()} → {d.stats.charsAfter.toLocaleString()} chars</span>
        <span class="stat-pill">{d.stats.linesBefore.toLocaleString()} → {d.stats.linesAfter.toLocaleString()} lines</span>
      </div>
      <textarea class="output-box" readonly value={d.output} rows="8"></textarea>
      <ResultActions
        text={d.output}
        showSendToEditor={true}
        showSendToConvert={true}
        showSendToChunk={true}
        editorFileName="transformed.txt"
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
    gap: 10px;
  }
  .checkbox-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 16px;
  }
  .check-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--ink);
    cursor: pointer;
  }
  .check-label input { cursor: pointer; accent-color: var(--accent); }
  .case-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .radio-group { display: flex; gap: 12px; flex-wrap: wrap; }
  .radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: var(--ink);
    cursor: pointer;
  }
  .radio-label input { cursor: pointer; accent-color: var(--accent); }
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
    min-height: 120px;
  }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
  @media (max-width: 500px) {
    .checkbox-grid { grid-template-columns: 1fr; }
  }
</style>
