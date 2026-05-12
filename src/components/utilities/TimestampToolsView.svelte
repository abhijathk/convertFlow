<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import type { TimestampResult } from '../../lib/utilities/tools/timestamp-tools';

  interface Props {
    meta: UtilityMeta;
    sendToEditor: (name: string, content: string) => void;
    sendToConvert: (content: string) => void;
    sendToChunk: (content: string) => void;
  }

  let { meta }: Props = $props();

  let input = $state('');
  let result = $state<UtilityResult | null>(null);
  let running = $state(false);
  let copyFeedbacks = $state<Record<string, string>>({});
  let copyTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  async function run() {
    running = true;
    result = await runUtility(meta.id, { input });
    running = false;
  }

  function copyField(key: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      if (copyTimers[key]) clearTimeout(copyTimers[key]);
      copyFeedbacks = { ...copyFeedbacks, [key]: 'copied' };
      copyTimers[key] = setTimeout(() => {
        copyFeedbacks = { ...copyFeedbacks, [key]: '' };
      }, 2000);
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') run();
  }
</script>

<div class="input-area">
  <label class="field-label" for="input-{meta.id}">Timestamp</label>
  <input
    id="input-{meta.id}"
    type="text"
    class="ts-input"
    bind:value={input}
    oninput={() => (result = null)}
    onkeydown={handleKeydown}
    placeholder="e.g. 1716912000 · 1716912000000 · 2024-05-29T00:00:00Z"
    spellcheck="false"
    aria-label="Timestamp input"
  />
  <p class="hint">Accepts Unix seconds/ms/μs/ns, ISO 8601, or any parseable date string.</p>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !input.trim()}>
    {running ? 'Converting…' : 'Convert'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as TimestampResult}
    <div class="result-panel" role="region" aria-label="Timestamp conversion results">
      <div class="format-badge">Detected: {d.inputFormat}</div>
      <div class="ts-rows">
        {#each ([
          { label: 'Unix seconds', value: String(d.unixSeconds) },
          { label: 'ISO 8601 UTC', value: d.iso },
          { label: 'Local time', value: d.local },
        ]) as row}
          <div class="ts-row">
            <span class="ts-label">{row.label}</span>
            <span class="ts-value">{row.value}</span>
            <button
              class="copy-inline"
              onclick={() => copyField(row.label, row.value)}
              aria-label="Copy {row.label}"
            >
              {copyFeedbacks[row.label] || 'Copy'}
            </button>
          </div>
        {/each}
      </div>
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
  .ts-input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 9px 12px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }
  .ts-input:focus { border-color: var(--accent); }
  .hint { font-size: 11px; color: var(--ink-dim); margin: 6px 0 0; }
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
  .format-badge {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .ts-rows { display: flex; flex-direction: column; gap: 0; }
  .ts-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    flex-wrap: wrap;
  }
  .ts-row:last-child { border-bottom: none; }
  .ts-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 110px;
    flex-shrink: 0;
  }
  .ts-value {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13px;
    color: var(--ink);
    flex: 1;
  }
  .copy-inline {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 0.1s;
  }
  .copy-inline:hover { color: var(--ink); }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
</style>
