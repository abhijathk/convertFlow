<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { TemplateExpanderResult } from '../../lib/utilities/tools/template-expander';
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
  let variables = $state('');

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { variables },
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
    <label class="field-label" for="input-{meta.id}">Template</label>
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
    placeholder="Hello, &#123;&#123;name&#125;&#125;! You are a &#123;&#123;role&#125;&#125; assistant."
    spellcheck="false"
    rows="6"
  ></textarea>
</div>

<div class="input-area">
  <label class="field-label" for="vars-{meta.id}">Variables <span class="hint">(key=value per line or JSON object)</span></label>
  <textarea
    id="vars-{meta.id}"
    class="primary-input"
    bind:value={variables}
    oninput={() => (result = null)}
    placeholder="name=Alice&#10;role=coding"
    spellcheck="false"
    rows="4"
  ></textarea>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Expanding…' : 'Expand Template'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as TemplateExpanderResult}
    <div class="result-panel" role="region" aria-label="Template expansion results">
      <div class="badges-row">
        {#if d.bound.length > 0}
          <span class="badge bound">bound: {d.bound.join(', ')}</span>
        {/if}
        {#if d.unbound.length > 0}
          <span class="badge unbound">unbound: {d.unbound.join(', ')}</span>
        {/if}
        {#if d.bound.length === 0 && d.unbound.length === 0}
          <span class="badge none">no placeholders found</span>
        {/if}
      </div>
      <textarea class="output-box" readonly value={d.rendered} rows="8"></textarea>
      <ResultActions
        text={d.rendered}
        showSendToEditor={true}
        showSendToConvert={true}
        showSendToChunk={false}
        editorFileName="rendered.txt"
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
  .hint {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
    color: var(--ink-dim);
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
    min-height: 80px;
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
  .badges-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .badge {
    font-size: 11px;
    border-radius: 3px;
    padding: 2px 8px;
    font-variant-numeric: tabular-nums;
  }
  .badge.bound {
    color: #22c55e;
    background: color-mix(in srgb, #22c55e 12%, transparent);
    border: 1px solid color-mix(in srgb, #22c55e 30%, transparent);
  }
  .badge.unbound {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
  }
  .badge.none {
    color: var(--ink-dim);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border: 1px solid var(--border);
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
</style>
