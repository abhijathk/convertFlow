<script lang="ts">
  import { appSettings } from '../stores/appSettings';
  import { pushToOpenAI } from '../lib/openai-finetune';
  import { pushToAnthropic } from '../lib/anthropic-finetune';

  interface Props {
    content: string;
    onclose: () => void;
  }

  let { content, onclose }: Props = $props();

  type Provider = 'openai' | 'anthropic';
  type Status = 'idle' | 'pushing' | 'done' | 'error';

  const OPENAI_MODELS = [
    { id: 'gpt-4o-mini-2024-07-18', label: 'GPT-4o mini' },
    { id: 'gpt-3.5-turbo-1106', label: 'GPT-3.5 Turbo' },
    { id: 'gpt-4o-2024-08-06', label: 'GPT-4o' },
  ];

  const ANTHROPIC_MODELS = [
    { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ];

  let provider = $state<Provider>('openai');
  let model = $state(OPENAI_MODELS[0].id);
  let status = $state<Status>('idle');
  let statusMsg = $state('');
  let resultJobId = $state('');
  let resultFileId = $state('');

  let apiKey = $derived(
    provider === 'openai' ? $appSettings.openaiApiKey : $appSettings.anthropicApiKey
  );

  let models = $derived(provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS);

  $effect(() => {
    // Reset model selection when provider changes
    const list = provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS;
    model = list[0].id;
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;

    status = 'pushing';
    statusMsg = 'Starting…';

    try {
      if (provider === 'openai') {
        const result = await pushToOpenAI({
          jsonl: content,
          baseModel: model,
          apiKey: apiKey.trim(),
          onProgress: (msg) => { statusMsg = msg; },
        });
        resultFileId = result.fileId;
        resultJobId = result.jobId;
        status = 'done';
        statusMsg = 'Fine-tune job started.';
      } else {
        await pushToAnthropic({
          jsonl: content,
          baseModel: model,
          apiKey: apiKey.trim(),
          onProgress: (msg) => { statusMsg = msg; },
        });
        status = 'done';
        statusMsg = 'Fine-tune job started.';
      }
    } catch (err) {
      status = 'error';
      statusMsg = err instanceof Error ? err.message : String(err);
    }
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  async function copyJobId() {
    if (resultJobId) await navigator.clipboard.writeText(resultJobId).catch(() => {});
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={handleBackdrop} role="dialog" aria-modal="true" aria-label="Push to Fine-tune API">
  <div class="dialog">
    <div class="dialog-header">
      <span class="dialog-title">Push to Fine-tune API</span>
      <button class="close-btn" onclick={onclose} aria-label="Close">×</button>
    </div>

    {#if status === 'done'}
      <div class="done-body">
        <p class="done-msg">Fine-tune job started successfully.</p>
        {#if resultJobId}
          <div class="result-row">
            <span class="result-label">Job ID</span>
            <span class="result-value">{resultJobId}</span>
            <button class="copy-btn" onclick={copyJobId} title="Copy job ID">copy</button>
          </div>
        {/if}
        {#if resultFileId}
          <div class="result-row">
            <span class="result-label">File ID</span>
            <span class="result-value">{resultFileId}</span>
          </div>
        {/if}
        {#if provider === 'openai'}
          <a
            href="https://platform.openai.com/finetune"
            target="_blank"
            rel="noopener noreferrer"
            class="ext-link"
          >Monitor at platform.openai.com/finetune →</a>
        {/if}
        <div class="dialog-actions">
          <button class="btn-primary" onclick={onclose}>close</button>
        </div>
      </div>
    {:else}
      <form class="dialog-body" onsubmit={handleSubmit}>
        <div class="field">
          <span class="field-label">Provider</span>
          <div class="provider-tabs">
            <button
              type="button"
              class="provider-tab"
              class:active={provider === 'openai'}
              onclick={() => (provider = 'openai')}
            >OpenAI</button>
            <button
              type="button"
              class="provider-tab"
              class:active={provider === 'anthropic'}
              onclick={() => (provider = 'anthropic')}
            >Anthropic</button>
          </div>
        </div>

        {#if provider === 'anthropic'}
          <div class="beta-notice" role="note">
            Anthropic fine-tuning is in private beta. Submitting will fail until
            your account has API access. See
            <a href="https://docs.anthropic.com" target="_blank" rel="noopener noreferrer">docs.anthropic.com</a>.
          </div>
        {/if}

        <label class="field">
          <span class="field-label">
            {provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key
            {#if !apiKey.trim()}
              <span class="key-warn">(not set — configure in Settings → Convert)</span>
            {/if}
          </span>
          <input
            type="password"
            class="field-input"
            value={apiKey}
            placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            autocomplete="off"
            readonly
            aria-label="API key (configure in Settings)"
          />
        </label>

        <label class="field">
          <span class="field-label">Base model</span>
          <select class="field-input" bind:value={model}>
            {#each models as m}
              <option value={m.id}>{m.label}</option>
            {/each}
          </select>
        </label>

        {#if status === 'pushing'}
          <p class="progress-msg">{statusMsg}</p>
        {/if}

        {#if status === 'error'}
          <p class="error-msg">{statusMsg}</p>
        {/if}

        <div class="dialog-actions">
          <button
            type="submit"
            class="btn-primary"
            disabled={status === 'pushing' || !apiKey.trim()}
            title={!apiKey.trim() ? 'Add API key in Settings → Convert first' : undefined}
          >
            {status === 'pushing' ? 'Pushing…' : 'Push'}
          </button>
          <button type="button" class="btn-cancel" onclick={onclose}>cancel</button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .dialog {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    width: 420px;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-direction: column;
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .dialog-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--ink-dim);
    padding: 0 2px;
    line-height: 1;
  }
  .close-btn:hover { color: var(--ink); }
  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
  }
  .done-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
  }
  .done-msg {
    margin: 0;
    font-size: 13px;
    color: var(--ok, #22c55e);
  }
  .result-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .result-label {
    font-size: 11px;
    color: var(--ink-dim);
    white-space: nowrap;
    min-width: 50px;
  }
  .result-value {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--ink);
    flex: 1;
    word-break: break-all;
  }
  .copy-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 2px 6px;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    cursor: pointer;
  }
  .copy-btn:hover { color: var(--ink); }
  .ext-link {
    font-size: 12px;
    color: var(--accent);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field-label {
    font-size: 11px;
    color: var(--ink-dim);
  }
  .field-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 5px 8px;
    outline: none;
  }
  .field-input:focus { border-color: var(--accent); }
  .field-input::placeholder { color: var(--muted); }
  .provider-tabs {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .provider-tab {
    flex: 1;
    background: none;
    border: none;
    border-right: 1px solid var(--border);
    padding: 5px 10px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .provider-tab:last-child { border-right: none; }
  .provider-tab:hover { color: var(--ink); background: var(--border); }
  .provider-tab.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); font-weight: 600; }
  .beta-notice {
    background: color-mix(in srgb, #f59e0b 10%, transparent);
    border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
    border-radius: 3px;
    padding: 8px 10px;
    font-size: 11px;
    color: var(--ink);
    line-height: 1.4;
  }
  .beta-notice a { color: var(--accent); }
  .key-warn {
    color: #f59e0b;
    font-style: italic;
    margin-left: 4px;
  }
  .progress-msg {
    margin: 0;
    font-size: 12px;
    color: var(--ink-dim);
    font-style: italic;
  }
  .error-msg {
    margin: 0;
    font-size: 12px;
    color: var(--err, #ef4444);
    word-break: break-word;
  }
  .dialog-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .btn-primary {
    background: none;
    border: 1px solid var(--accent);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
    padding: 4px 12px;
  }
  .btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .btn-primary:disabled { opacity: 0.4; cursor: default; }
  .btn-cancel {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    padding: 4px 10px;
  }
  .btn-cancel:hover { background: var(--border); color: var(--ink); }
</style>
