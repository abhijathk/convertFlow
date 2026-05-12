<script lang="ts">
  import { chunkState } from '../stores/chunkState';

  let open = $state(false);

  const fields = [
    { key: 'doc_id', label: 'doc_id', placeholder: 'my-document-v1' },
    { key: 'category', label: 'category', placeholder: 'technical-docs' },
    { key: 'tags', label: 'tags', placeholder: 'comma, separated' },
    { key: 'author', label: 'author', placeholder: '' },
    { key: 'language', label: 'language', placeholder: 'en' },
  ] as const;

  function updateMeta(key: string, value: string) {
    chunkState.update((s) => ({
      ...s,
      userMeta: { ...s.userMeta, [key]: value },
    }));
  }
</script>

<div class="metadata-panel">
  <button
    class="header"
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-controls="metadata-fields"
  >
    <span class="title">METADATA</span>
    <span aria-hidden="true">{open ? '─' : '+'}</span>
  </button>

  {#if open}
    <div class="fields" id="metadata-fields">
      {#each fields as field}
        <label class="field">
          <span class="field-key">{field.label}:</span>
          <input
            type="text"
            placeholder={field.placeholder}
            value={$chunkState.userMeta[field.key]}
            oninput={(e) => updateMeta(field.key, (e.target as HTMLInputElement).value)}
          />
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .metadata-panel {
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 6px 16px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    letter-spacing: 0.05em;
    text-align: left;
  }

  .header:hover { background: rgba(255,255,255,0.03); }

  .fields {
    padding: 8px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-key {
    font-size: 12px;
    color: var(--ink-dim);
    width: 72px;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 8px;
    outline: none;
  }

  input:focus { border-color: var(--accent); }
  input::placeholder { color: var(--muted); }
</style>
