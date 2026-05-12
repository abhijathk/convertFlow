<script lang="ts">
  interface Props {
    text: string;
    showSendToEditor?: boolean;
    showSendToConvert?: boolean;
    showSendToChunk?: boolean;
    editorFileName?: string;
    sendToEditor?: (name: string, content: string) => void;
    sendToConvert?: (content: string) => void;
    sendToChunk?: (content: string) => void;
  }

  let {
    text,
    showSendToEditor = false,
    showSendToConvert = false,
    showSendToChunk = false,
    editorFileName = 'output.txt',
    sendToEditor,
    sendToConvert,
    sendToChunk,
  }: Props = $props();

  let copyFeedback = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      if (copyTimer) clearTimeout(copyTimer);
      copyFeedback = 'copied';
      copyTimer = setTimeout(() => (copyFeedback = ''), 2000);
    });
  }
</script>

<div class="result-actions">
  <button class="action-btn" onclick={copy}>{copyFeedback || 'Copy'}</button>
  {#if showSendToEditor && sendToEditor}
    <button class="action-btn" onclick={() => sendToEditor!(editorFileName, text)}>Send to Editor</button>
  {/if}
  {#if showSendToConvert && sendToConvert}
    <button class="action-btn" onclick={() => sendToConvert!(text)}>Send to Convert</button>
  {/if}
  {#if showSendToChunk && sendToChunk}
    <button class="action-btn" onclick={() => sendToChunk!(text)}>Send to Chunk</button>
  {/if}
</div>

<style>
  .result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .action-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    transition: color 0.1s, border-color 0.1s;
  }
  .action-btn:hover { color: var(--ink); border-color: var(--ink-dim); }
</style>
