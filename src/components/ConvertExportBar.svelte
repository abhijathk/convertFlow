<script lang="ts">
  import { convertState } from '../stores/convertState';
  import type { ExportFormat } from '../stores/convertState';

  interface Props {
    oncopy?: () => void;
    ondownload?: () => void;
    copyFeedback?: string;
  }

  let { oncopy, ondownload, copyFeedback = '' }: Props = $props();

  const formats: { id: ExportFormat; label: string; title: string }[] = [
    { id: 'jsonl', label: 'JSONL',     title: 'One JSON object per line (original format)' },
    { id: 'json',  label: 'JSON',      title: 'Pretty-printed JSON array' },
    { id: 'md',    label: 'Markdown',  title: 'Conversations formatted as readable Markdown' },
    { id: 'txt',   label: 'TXT',       title: 'Plain text — message content only, no JSON structure' },
  ];

  let fmt = $derived($convertState.exportFormat);
  let hasContent = $derived($convertState.lineCount > 0);

  function pick(id: ExportFormat) {
    convertState.update(s => ({ ...s, exportFormat: id }));
  }
</script>

<div class="export-bar">
  <div class="format-tabs" role="tablist" aria-label="Export format">
    {#each formats as f}
      <button
        role="tab"
        aria-selected={fmt === f.id}
        class:active={fmt === f.id}
        onclick={() => pick(f.id)}
        title={f.title}
        disabled={!hasContent}
      >{f.label}</button>
    {/each}
  </div>

  <div class="actions">
    <button
      onclick={oncopy}
      disabled={!hasContent}
      class:ok={!!copyFeedback}
    >
      {copyFeedback ? '✓ copied' : 'copy'}
    </button>
    <button
      onclick={ondownload}
      disabled={!hasContent}
    >download ↓</button>
  </div>
</div>

<style>
  .export-bar {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    height: 32px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 16px 0 0;
    flex-shrink: 0;
  }

  .format-tabs {
    display: flex;
    align-items: stretch;
  }

  .format-tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0 11px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    margin-bottom: -1px;
    transition: color 0.1s;
    white-space: nowrap;
  }

  .format-tabs button:hover:not(:disabled) { color: var(--ink); }

  .format-tabs button.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .format-tabs button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .actions button {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
  }

  .actions button:hover:not(:disabled) { background: var(--border); }
  .actions button:disabled { opacity: 0.35; cursor: default; }
  .actions button.ok { color: var(--ok); border-color: var(--ok); }
</style>
