<script lang="ts">
  import { pushToHfHub } from '../lib/hf-hub';

  interface Props {
    content: string;
    defaultFileName?: string;
    onclose: () => void;
  }

  let { content, defaultFileName = 'dataset.jsonl', onclose }: Props = $props();

  const TOKEN_KEY = 'dataprep:hf-token';

  let token = $state(typeof localStorage !== 'undefined' ? (localStorage.getItem(TOKEN_KEY) ?? '') : '');
  let rememberToken = $state(typeof localStorage !== 'undefined' && !!localStorage.getItem(TOKEN_KEY));
  let repo = $state('');
  let fileName = $state(defaultFileName);
  let isPrivate = $state(false);
  let status = $state<'idle' | 'pushing' | 'done' | 'error'>('idle');
  let statusMsg = $state('');
  let repoUrl = $state('');

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!token.trim() || !repo.trim() || !fileName.trim()) return;

    if (rememberToken) {
      localStorage.setItem(TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }

    status = 'pushing';
    statusMsg = 'Creating repo…';

    try {
      const result = await pushToHfHub({
        token: token.trim(),
        repo: repo.trim(),
        fileName: fileName.trim(),
        content,
        private: isPrivate,
      });
      repoUrl = result.repoUrl;
      status = 'done';
      statusMsg = 'Uploaded successfully.';
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
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={handleBackdrop} role="dialog" aria-modal="true" aria-label="Push to Hugging Face Hub">
  <div class="dialog">
    <div class="dialog-header">
      <span class="dialog-title">Push to HF Hub</span>
      <button class="close-btn" onclick={onclose} aria-label="Close">×</button>
    </div>

    {#if status === 'done'}
      <div class="done-body">
        <p class="done-msg">Uploaded to HF Hub.</p>
        <a href={repoUrl} target="_blank" rel="noopener noreferrer" class="repo-link">{repoUrl}</a>
        <div class="dialog-actions">
          <button class="btn-primary" onclick={onclose}>close</button>
        </div>
      </div>
    {:else}
      <form class="dialog-body" onsubmit={handleSubmit}>
        <label class="field">
          <span class="field-label">HF token</span>
          <input
            type="password"
            class="field-input"
            bind:value={token}
            placeholder="hf_..."
            autocomplete="off"
            required
          />
        </label>

        <label class="field checkbox-field">
          <input type="checkbox" bind:checked={rememberToken} />
          <span class="checkbox-label">remember on this device <span class="warn-note">(stores in localStorage)</span></span>
        </label>

        <label class="field">
          <span class="field-label">dataset repo</span>
          <input
            type="text"
            class="field-input"
            bind:value={repo}
            placeholder="username/my-dataset"
            autocomplete="off"
            required
          />
        </label>

        <label class="field">
          <span class="field-label">file name</span>
          <input
            type="text"
            class="field-input"
            bind:value={fileName}
            placeholder="dataset.jsonl"
            autocomplete="off"
            required
          />
        </label>

        <label class="field checkbox-field">
          <input type="checkbox" bind:checked={isPrivate} />
          <span class="checkbox-label">private repo</span>
        </label>

        {#if status === 'error'}
          <p class="error-msg">{statusMsg}</p>
        {/if}

        <div class="dialog-actions">
          <button type="submit" class="btn-primary" disabled={status === 'pushing'}>
            {status === 'pushing' ? statusMsg : 'push ↑'}
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
    width: 380px;
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
    color: var(--ok);
  }

  .repo-link {
    font-size: 12px;
    color: var(--accent);
    word-break: break-all;
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

  .checkbox-field {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  .checkbox-field input[type='checkbox'] {
    accent-color: var(--accent);
    width: 13px;
    height: 13px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .checkbox-label {
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
  }

  .warn-note {
    font-size: 11px;
    color: var(--warn);
  }

  .error-msg {
    margin: 0;
    font-size: 12px;
    color: var(--err);
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
