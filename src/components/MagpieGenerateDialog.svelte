<script lang="ts">
  import { appSettings } from '../stores/appSettings';
  import { generateMagpie, rowToJsonl, type MagpieRow } from '../lib/magpie';

  interface Props {
    onclose: () => void;
    onappend?: (jsonl: string) => void;
  }

  let { onclose, onappend }: Props = $props();

  let endpoint = $state($appSettings.localLlmEndpoint);
  let model = $state($appSettings.localLlmModel);
  let topic = $state('');
  let count = $state(20);
  let status = $state<'idle' | 'running' | 'done' | 'error' | 'cancelled'>('idle');
  let generated = $state(0);
  let failed = $state(0);
  let errorMsg = $state('');
  let collectedRows = $state<MagpieRow[]>([]);
  let abortController = $state<AbortController | null>(null);

  async function start() {
    if (status === 'running') return;
    status = 'running';
    generated = 0;
    failed = 0;
    errorMsg = '';
    collectedRows = [];

    abortController = new AbortController();

    try {
      const result = await generateMagpie({
        endpoint,
        model,
        count,
        topic: topic.trim() || undefined,
        signal: abortController.signal,
        onRow: (row) => {
          collectedRows = [...collectedRows, row];
          generated = collectedRows.length;
        },
        onError: () => { failed++; },
      });
      status = abortController.signal.aborted ? 'cancelled' : 'done';
      // Even on partial result, save what we got
      if (result.rows.length > 0 && onappend) {
        const jsonl = result.rows.map(rowToJsonl).join('\n');
        onappend(jsonl);
      }
    } catch (err) {
      status = 'error';
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      abortController = null;
    }
  }

  function cancel() {
    if (abortController) {
      abortController.abort();
      status = 'cancelled';
    }
  }

  function close() {
    if (status === 'running') cancel();
    onclose();
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function persistSettings() {
    appSettings.update(s => ({ ...s, localLlmEndpoint: endpoint, localLlmModel: model }));
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="dialog-backdrop" onclick={onBackdropClick}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Generate synthetic data">
    <header class="dialog-header">
      <h2>Generate synthetic data</h2>
      <button class="close-btn" onclick={close} aria-label="Close">×</button>
    </header>

    <div class="caveat">
      Requires a local LLM endpoint running Ollama, LM Studio, or llama.cpp's HTTP server.
      Uses the <a href="https://arxiv.org/abs/2406.08464" target="_blank" rel="noopener noreferrer">Magpie</a> technique
      — generates a diverse user query, then captures the response.
    </div>

    <div class="form">
      <label class="row">
        <span>Endpoint</span>
        <input
          type="text"
          bind:value={endpoint}
          onblur={persistSettings}
          placeholder="http://localhost:11434"
          disabled={status === 'running'}
        />
      </label>

      <label class="row">
        <span>Model</span>
        <input
          type="text"
          bind:value={model}
          onblur={persistSettings}
          placeholder="llama3.1"
          disabled={status === 'running'}
        />
      </label>

      <label class="row">
        <span>Topic <em>(optional)</em></span>
        <input
          type="text"
          bind:value={topic}
          placeholder="e.g. data science, cooking, customer support"
          disabled={status === 'running'}
        />
      </label>

      <label class="row">
        <span>Target count</span>
        <input
          type="number"
          bind:value={count}
          min="1"
          max="10000"
          disabled={status === 'running'}
        />
      </label>
    </div>

    {#if status === 'running' || status === 'done' || status === 'cancelled'}
      <div class="progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: {count > 0 ? ((generated + failed) / count) * 100 : 0}%"></div>
        </div>
        <div class="progress-text">
          {#if status === 'running'}Generating {generated + failed} / {count}…{/if}
          {#if status === 'done'}Done — {generated} generated{#if failed > 0}, {failed} failed{/if}{/if}
          {#if status === 'cancelled'}Cancelled — {generated} generated{/if}
        </div>
      </div>
    {/if}

    {#if status === 'error'}
      <div class="error">Error: {errorMsg}</div>
    {/if}

    <footer class="dialog-footer">
      {#if status === 'running'}
        <button class="btn" onclick={cancel}>Cancel</button>
      {:else if status === 'done' || status === 'cancelled' || status === 'error'}
        <button class="btn" onclick={close}>Close</button>
        <button class="btn primary" onclick={start}>Generate more</button>
      {:else}
        <button class="btn" onclick={close}>Cancel</button>
        <button class="btn primary" onclick={start} disabled={!endpoint || !model || count < 1}>Start</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 500;
  }
  .dialog {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    width: min(520px, 90vw);
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }
  .dialog-header h2 {
    margin: 0;
    font-size: 14px;
    color: var(--ink);
    font-weight: 600;
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 3px;
  }
  .close-btn:hover { color: var(--ink); background: var(--bg); }

  .caveat {
    padding: 10px 18px;
    font-size: 11px;
    color: var(--ink-dim);
    line-height: 1.5;
    border-bottom: 1px solid var(--border);
  }
  .caveat a { color: var(--accent); text-decoration: none; }
  .caveat a:hover { text-decoration: underline; }

  .form {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--ink);
  }
  .row em {
    font-style: normal;
    color: var(--muted);
    font-size: 11px;
  }
  .row input[type="text"],
  .row input[type="number"] {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 6px 9px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
  }
  .row input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .row input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .progress {
    padding: 0 18px 12px;
  }
  .progress-bar {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    height: 10px;
    overflow: hidden;
  }
  .progress-fill {
    background: var(--accent);
    height: 100%;
    transition: width 0.15s;
  }
  .progress-text {
    margin-top: 6px;
    font-size: 11px;
    color: var(--ink-dim);
  }

  .error {
    margin: 0 18px 12px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--err) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--err) 35%, transparent);
    border-radius: 3px;
    color: var(--err);
    font-size: 11px;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border);
  }
  .btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--ink-dim);
    border-radius: 3px;
    padding: 6px 14px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
  }
  .btn:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-dim); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 88%, white);
  }
</style>
