<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput, setToolPrefilled } from '../../stores/utilitiesState';
  import { getActiveFile } from '../../stores/editorState';
  import type { MigrationResult, Schema } from '../../lib/utilities/tools/schema-migrator';
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

  let sourceSchema = $state<'auto' | Schema>('auto');
  let targetSchema = $state<Schema>('chatml');
  let preserveExtra = $state(false);

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { source: sourceSchema, target: targetSchema, preserveExtra },
    });
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

  const SCHEMA_LABELS: Record<string, string> = {
    auto: 'Auto-detect',
    chatml: 'ChatML (OpenAI)',
    harmony: 'Harmony (Anthropic)',
    alpaca: 'Alpaca (Llama)',
    sharegpt: 'ShareGPT (Mistral)',
  };
</script>

{#if toolState.prefillTruncated}
  <div class="truncation-strip" role="alert">
    File too large to auto-load — showing first 100KB.
    <button class="load-full-btn" onclick={loadFullFile}>Load full file</button>
  </div>
{/if}

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">JSONL Input</label>
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
    placeholder="Paste JSONL here — one JSON object per line…"
    spellcheck="false"
    rows="8"
  ></textarea>
</div>

<div class="settings-panel">
  <div class="schema-row">
    <div class="schema-field">
      <label class="field-label" for="source-{meta.id}">Source Schema</label>
      <select
        id="source-{meta.id}"
        class="schema-select"
        bind:value={sourceSchema}
        onchange={() => (result = null)}
      >
        <option value="auto">Auto-detect</option>
        <option value="chatml">ChatML (OpenAI)</option>
        <option value="harmony">Harmony (Anthropic)</option>
        <option value="alpaca">Alpaca (Llama)</option>
        <option value="sharegpt">ShareGPT (Mistral)</option>
      </select>
    </div>
    <div class="schema-arrow" aria-hidden="true">→</div>
    <div class="schema-field">
      <label class="field-label" for="target-{meta.id}">Target Schema</label>
      <select
        id="target-{meta.id}"
        class="schema-select"
        bind:value={targetSchema}
        onchange={() => (result = null)}
      >
        <option value="chatml">ChatML (OpenAI)</option>
        <option value="harmony">Harmony (Anthropic)</option>
        <option value="alpaca">Alpaca (Llama)</option>
        <option value="sharegpt">ShareGPT (Mistral)</option>
      </select>
    </div>
  </div>
  <label class="preserve-label">
    <input
      type="checkbox"
      bind:checked={preserveExtra}
      onchange={() => (result = null)}
    />
    Preserve extra fields (pass through non-schema keys to output)
  </label>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput.trim()}>
    {running ? 'Migrating…' : 'Migrate'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as MigrationResult}
    <div class="result-panel" role="region" aria-label="Migration results">
      <div class="stats-bar">
        <span class="stat-chip ok">{d.recordsTransformed.toLocaleString()} migrated</span>
        {#if d.recordsFailed > 0}
          <span class="stat-chip fail">{d.recordsFailed} failed</span>
        {/if}
        <span class="stat-chip schema">{SCHEMA_LABELS[d.sourceSchema]} → {SCHEMA_LABELS[d.targetSchema]}</span>
        {#if d.droppedFields.length > 0}
          <span class="stat-chip dropped" title={d.droppedFields.join(', ')}>
            {d.droppedFields.length} dropped field{d.droppedFields.length === 1 ? '' : 's'}: {d.droppedFields.join(', ')}
          </span>
        {/if}
      </div>

      {#if d.failures.length > 0}
        <details class="failures-details">
          <summary class="failures-summary">
            {d.failures.length} failure{d.failures.length === 1 ? '' : 's'}
          </summary>
          <ul class="failures-list">
            {#each d.failures as f}
              <li><span class="fail-line">line {f.line}</span> {f.error}</li>
            {/each}
          </ul>
        </details>
      {/if}

      {#if d.samples.length > 0}
        <div class="diff-section">
          <p class="diff-heading">Preview — first {d.samples.length} record{d.samples.length === 1 ? '' : 's'}</p>
          <div class="diff-cards">
            {#each d.samples as sample, i}
              <div class="diff-card">
                <div class="diff-header">
                  <span class="diff-index">#{i + 1}</span>
                  <span class="diff-schema-tag source-tag">{SCHEMA_LABELS[d.sourceSchema]}</span>
                  <span class="diff-arrow" aria-hidden="true">→</span>
                  <span class="diff-schema-tag target-tag">{SCHEMA_LABELS[d.targetSchema]}</span>
                </div>
                <div class="diff-panes">
                  <pre class="diff-pane source-pane">{sample.source}</pre>
                  <pre class="diff-pane target-pane">{sample.target}</pre>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if d.output}
        <div class="output-section">
          <label class="field-label" for="output-{meta.id}">Output JSONL</label>
          <textarea
            id="output-{meta.id}"
            class="output-box"
            readonly
            value={d.output}
            rows="10"
          ></textarea>
          <ResultActions
            text={d.output}
            showSendToEditor={true}
            showSendToConvert={true}
            showSendToChunk={true}
            editorFileName="migrated.jsonl"
            {sendToEditor}
            {sendToConvert}
            {sendToChunk}
          />
        </div>
      {/if}
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
    min-height: 120px;
  }
  .primary-input:focus { border-color: var(--accent); }

  .settings-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 14px;
  }
  .schema-row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }
  .schema-field { display: flex; flex-direction: column; flex: 1; min-width: 140px; }
  .schema-arrow {
    font-size: 18px;
    color: var(--ink-dim);
    padding-bottom: 4px;
    flex-shrink: 0;
  }
  .schema-select {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;
    width: 100%;
    outline: none;
    box-sizing: border-box;
    cursor: pointer;
  }
  .schema-select:focus { border-color: var(--accent); }

  .preserve-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ink);
    cursor: pointer;
    margin-top: 10px;
  }
  .preserve-label input { accent-color: var(--accent); cursor: pointer; }

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

  .stats-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .stat-chip {
    font-size: 12px;
    border-radius: 3px;
    padding: 2px 8px;
    font-variant-numeric: tabular-nums;
    border: 1px solid transparent;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 340px;
  }
  .stat-chip.ok {
    background: color-mix(in srgb, #22c55e 12%, transparent);
    border-color: color-mix(in srgb, #22c55e 30%, transparent);
    color: var(--ink);
  }
  .stat-chip.fail {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border-color: color-mix(in srgb, #ef4444 30%, transparent);
    color: var(--ink);
  }
  .stat-chip.schema {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent) 25%, transparent);
    color: var(--ink);
  }
  .stat-chip.dropped {
    background: color-mix(in srgb, #f59e0b 10%, transparent);
    border-color: color-mix(in srgb, #f59e0b 30%, transparent);
    color: var(--ink);
    cursor: help;
  }

  .failures-details {
    background: color-mix(in srgb, #ef4444 6%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
    border-radius: 4px;
    padding: 8px 12px;
  }
  .failures-summary {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
    user-select: none;
  }
  .failures-list {
    margin: 8px 0 0;
    padding: 0 0 0 16px;
    font-size: 12px;
    color: var(--ink-dim);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .failures-list li { list-style: disc; }
  .fail-line {
    font-weight: 600;
    color: #ef4444;
    margin-right: 4px;
  }

  .diff-section { display: flex; flex-direction: column; gap: 8px; }
  .diff-heading {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 0;
  }
  .diff-cards { display: flex; flex-direction: column; gap: 10px; }
  .diff-card {
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .diff-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .diff-index {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-dim);
  }
  .diff-schema-tag {
    font-size: 11px;
    border-radius: 3px;
    padding: 1px 6px;
    font-weight: 600;
  }
  .source-tag {
    background: color-mix(in srgb, #6366f1 12%, transparent);
    border: 1px solid color-mix(in srgb, #6366f1 30%, transparent);
    color: var(--ink);
  }
  .target-tag {
    background: color-mix(in srgb, #22c55e 12%, transparent);
    border: 1px solid color-mix(in srgb, #22c55e 30%, transparent);
    color: var(--ink);
  }
  .diff-arrow {
    font-size: 13px;
    color: var(--ink-dim);
  }
  .diff-panes {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .diff-pane {
    margin: 0;
    padding: 10px 12px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-all;
    overflow: auto;
    max-height: 200px;
    line-height: 1.5;
  }
  .source-pane {
    background: color-mix(in srgb, #6366f1 5%, var(--surface));
    border-right: 1px solid var(--border);
  }
  .target-pane {
    background: color-mix(in srgb, #22c55e 5%, var(--surface));
  }

  .output-section { display: flex; flex-direction: column; gap: 6px; }
  .output-box {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 10px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    min-height: 100px;
  }

  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }

  @media (max-width: 560px) {
    .diff-panes { grid-template-columns: 1fr; }
    .source-pane { border-right: none; border-bottom: 1px solid var(--border); }
    .schema-arrow { display: none; }
  }
</style>
