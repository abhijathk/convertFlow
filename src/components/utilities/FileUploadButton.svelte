<script lang="ts" context="module">
  export const TEXT_ACCEPT = '.txt,.md,.markdown,.json,.jsonl,.csv,.tsv,text/plain,text/markdown,text/csv,application/json,text/tab-separated-values';
</script>

<script lang="ts">
  interface Props {
    accept: string;
    onload: (content: string, filename: string, truncated: boolean) => void;
    label?: string;
    maxBytes?: number;
  }

  let { accept, onload, label = '↑ Upload file', maxBytes = 100_000 }: Props = $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  let feedback = $state('');
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  function showFeedback(msg: string) {
    feedback = msg;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { feedback = ''; }, 2000);
  }

  async function handleChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const truncated = text.length > maxBytes;
      onload(truncated ? text.slice(0, maxBytes) : text, file.name, truncated);
      showFeedback(`Loaded ${file.name}`);
    } catch {
      showFeedback('Could not read file');
    }
    if (fileInput) fileInput.value = '';
  }
</script>

<div class="upload-wrap">
  <button class="upload-btn" type="button" onclick={() => fileInput?.click()}>
    {label}
  </button>
  <input
    bind:this={fileInput}
    type="file"
    {accept}
    class="hidden-input"
    onchange={handleChange}
    tabindex="-1"
    aria-hidden="true"
  />
  {#if feedback}
    <span class="feedback">{feedback}</span>
  {/if}
</div>

<style>
  .upload-wrap { display: inline-flex; align-items: center; gap: 6px; }
  .upload-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    white-space: nowrap;
    transition: color 0.1s, border-color 0.1s;
  }
  .upload-btn:hover { color: var(--ink); border-color: var(--ink-dim); }
  .hidden-input { display: none; }
  .feedback {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
