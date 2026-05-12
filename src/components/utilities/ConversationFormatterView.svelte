<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { ConversationFormatterResult, ConvSchema } from '../../lib/utilities/tools/conversation-formatter';
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
  let schema = $state<ConvSchema>('openai');

  const SCHEMAS: { value: ConvSchema; label: string }[] = [
    { value: 'openai', label: 'OpenAI Chat (messages[])' },
    { value: 'anthropic', label: 'Anthropic Messages' },
    { value: 'alpaca', label: 'Alpaca (instruction/output)' },
    { value: 'sharegpt', label: 'ShareGPT (conversations[])' },
  ];

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { schema },
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
    <label class="field-label" for="input-{meta.id}">Transcript Input</label>
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
    placeholder="User: Hello&#10;Assistant: Hi there! How can I help?&#10;&#10;User: What is 2+2?&#10;Assistant: 4"
    spellcheck="false"
    rows="8"
  ></textarea>
  <p class="hint-text">Separate multiple conversations with a blank line. Role labels: User / Human, Assistant / AI / Bot, System.</p>
</div>

<div class="settings-row">
  <div class="setting-group">
    <label class="field-label" for="schema-{meta.id}">Output schema</label>
    <select id="schema-{meta.id}" class="select-input" bind:value={schema} onchange={() => (result = null)}>
      {#each SCHEMAS as s}
        <option value={s.value}>{s.label}</option>
      {/each}
    </select>
  </div>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Formatting…' : 'Format Conversation'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as ConversationFormatterResult}
    <div class="result-panel" role="region" aria-label="Conversation format results">
      <div class="stats-row">
        <span class="stat-pill">{d.conversationCount} conversation{d.conversationCount !== 1 ? 's' : ''}</span>
        <span class="stat-pill">{d.messageCount} messages</span>
      </div>
      <textarea class="output-box" readonly value={d.output} rows="10"></textarea>
      <ResultActions
        text={d.output}
        showSendToEditor={true}
        showSendToConvert={true}
        showSendToChunk={false}
        editorFileName="conversations.jsonl"
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
  .hint-text {
    font-size: 11px;
    color: var(--ink-dim);
    margin: 4px 0 0 0;
    font-style: italic;
  }
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
    min-height: 160px;
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
