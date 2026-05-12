<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import { MODEL_PRICING } from '../../lib/utilities/tools/cost-calculator';
  import type { CostResult } from '../../lib/utilities/tools/cost-calculator';
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

  let outputText = $state('');
  let cachePct = $state(0);
  let selectedModel = $state(MODEL_PRICING[0].id);

  const groupedModels = MODEL_PRICING.reduce<Record<string, typeof MODEL_PRICING>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});
  const providers = Object.keys(groupedModels);

  let selectedProvider = $state(MODEL_PRICING[0].provider);
  let modelsForProvider = $derived(groupedModels[selectedProvider] ?? []);

  function onProviderChange(provider: string) {
    selectedProvider = provider;
    const first = groupedModels[provider]?.[0];
    if (first) selectedModel = first.id;
    result = null;
  }

  async function run() {
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { outputText, cachePct, model: selectedModel },
    });
    running = false;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function handleInputUpload(content: string, _filename: string, _truncated: boolean) {
    setToolInput(meta.id, content);
    result = null;
  }

  function handleOutputUpload(content: string, _filename: string, _truncated: boolean) {
    outputText = content;
    result = null;
  }

  function fmt(n: number): string {
    if (n < 0.0001) return '$0.0000';
    if (n < 0.01) return `$${n.toFixed(4)}`;
    if (n < 10) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(2)}`;
  }

  function summarize(d: CostResult): string {
    return [
      `Model: ${d.model}`,
      `Input tokens: ${d.inputTokens.toLocaleString()} — ${fmt(d.inputCost)}`,
      `Output tokens: ${d.outputTokens.toLocaleString()} — ${fmt(d.outputCost)}`,
      `Cached tokens: ${d.cachedTokens.toLocaleString()} — ${fmt(d.cachedCost)}`,
      `Total: ${fmt(d.totalCost)}`,
    ].join('\n');
  }
</script>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">Input text</label>
    <div class="action-buttons">
      <FileUploadButton accept={TEXT_ACCEPT} onload={handleInputUpload} />
      <EditorSelectionButton onload={handleInputUpload} />
    </div>
  </div>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste your input prompt / context here…"
    spellcheck="false"
    rows="6"
  ></textarea>
</div>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="output-{meta.id}">Output text (optional)</label>
    <div class="action-buttons">
      <FileUploadButton accept={TEXT_ACCEPT} onload={handleOutputUpload} />
      <EditorSelectionButton onload={handleOutputUpload} />
    </div>
  </div>
  <textarea
    id="output-{meta.id}"
    class="primary-input"
    bind:value={outputText}
    oninput={() => (result = null)}
    placeholder="Paste expected output here to include output cost…"
    spellcheck="false"
    rows="4"
  ></textarea>
</div>

<div class="settings-row">
  <div class="setting-group">
    <label class="field-label" for="model-{meta.id}">Model</label>
    <div class="model-selects">
      <select
        class="select-input"
        value={selectedProvider}
        onchange={(e) => onProviderChange(e.currentTarget.value)}
        aria-label="Provider"
      >
        {#each providers as provider (provider)}
          <option value={provider}>{provider}</option>
        {/each}
      </select>
      <select
        id="model-{meta.id}"
        class="select-input"
        bind:value={selectedModel}
        onchange={() => (result = null)}
        aria-label="Model"
      >
        {#each modelsForProvider as m (m.id)}
          <option value={m.id}>{m.name} — ${m.inputPerM}/M in · ${m.outputPerM}/M out</option>
        {/each}
      </select>
    </div>
  </div>
  <div class="setting-group">
    <label class="field-label" for="cache-{meta.id}">Cached input: {cachePct}%</label>
    <input
      id="cache-{meta.id}"
      type="range"
      min="0"
      max="100"
      bind:value={cachePct}
      oninput={() => (result = null)}
      class="range-input"
    />
  </div>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running}>
    {running ? 'Calculating…' : 'Calculate Cost'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as CostResult}
    <div class="result-panel" role="region" aria-label="Cost calculation results">
      <div class="model-label">{d.model}</div>
      <div class="cost-grid">
        <div class="cost-row">
          <span class="cost-name">Input ({d.inputTokens.toLocaleString()} tokens)</span>
          <span class="cost-value">{fmt(d.inputCost)}</span>
        </div>
        {#if d.cachedTokens > 0}
          <div class="cost-row cached">
            <span class="cost-name">Cached input ({d.cachedTokens.toLocaleString()} tokens)</span>
            <span class="cost-value">{fmt(d.cachedCost)}</span>
          </div>
        {/if}
        <div class="cost-row">
          <span class="cost-name">Output ({d.outputTokens.toLocaleString()} tokens)</span>
          <span class="cost-value">{fmt(d.outputCost)}</span>
        </div>
        <div class="cost-row total">
          <span class="cost-name">Total</span>
          <span class="cost-value">{fmt(d.totalCost)}</span>
        </div>
      </div>
      <ResultActions
        text={summarize(d)}
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
    min-height: 80px;
  }
  .primary-input:focus { border-color: var(--accent); }
  .settings-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .setting-group { display: flex; flex-direction: column; flex: 1; min-width: 140px; }
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
  .model-selects { display: flex; gap: 6px; }
  .model-selects .select-input { flex: 1; min-width: 0; }
  .range-input { width: 100%; cursor: pointer; accent-color: var(--accent); margin-top: 4px; }
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
    gap: 10px;
  }
  .model-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .cost-grid { display: flex; flex-direction: column; gap: 6px; }
  .cost-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 13px;
    color: var(--ink-dim);
    padding: 4px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  .cost-row.cached { color: color-mix(in srgb, var(--accent) 80%, var(--ink-dim)); }
  .cost-row.total {
    font-weight: 700;
    font-size: 15px;
    color: var(--ink);
    border-bottom: none;
    margin-top: 4px;
  }
  .cost-value { font-variant-numeric: tabular-nums; font-weight: 600; }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
</style>
