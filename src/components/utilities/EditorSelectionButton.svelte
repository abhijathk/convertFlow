<script lang="ts">
  import { editorSelection } from '../../stores/editorState';

  interface Props {
    onload: (content: string, filename: string, truncated: boolean) => void;
  }
  let { onload }: Props = $props();

  let feedback = $state('');
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  let hasSelection = $derived(!!$editorSelection && $editorSelection.text.length > 0);
  let selectionPreview = $derived(
    $editorSelection?.text
      ? `${$editorSelection.text.length.toLocaleString()} chars selected in Editor`
      : 'No Editor selection'
  );

  function useSelection() {
    const sel = $editorSelection;
    if (!sel || !sel.text) return;
    onload(sel.text, 'editor-selection.txt', false);
    feedback = `Loaded ${sel.text.length} chars`;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { feedback = ''; }, 2000);
  }
</script>

<button
  class="selection-btn"
  onclick={useSelection}
  disabled={!hasSelection}
  title={selectionPreview}
  aria-label="Use Editor selection as input"
>
  {feedback || '↳ Use Editor selection'}
</button>

<style>
  .selection-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    padding: 3px 8px;
    transition: color 0.1s, border-color 0.1s, background 0.1s;
  }
  .selection-btn:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--ink-dim);
    background: var(--surface);
  }
  .selection-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
