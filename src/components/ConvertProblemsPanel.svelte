<script lang="ts">
  import { convertState } from '../stores/convertState';
  import { analytics } from '../lib/analytics';
  import { suggestFix } from '../lib/auto-fix';

  interface Props {
    onjumpline?: (line: number) => void;
    content?: string;
    onfix?: (newContent: string) => void;
    onopenateditor?: (line: number) => void;
  }

  let { onjumpline, content = '', onfix, onopenateditor }: Props = $props();

  let collapsed = $state(false);
  let errors = $derived($convertState.errors);
  let hasErrors = $derived(errors.length > 0);
  let lineCount = $derived($convertState.lineCount);

  function handleRowClick(line: number) {
    onjumpline?.(line);
    analytics.problemClicked(line);
  }

  function handleFix(e: MouseEvent, errLine: number) {
    e.stopPropagation();
    if (!onfix || !content) return;
    const err = errors.find(er => er.line === errLine);
    if (!err) return;
    const fix = suggestFix(content, err);
    if (!fix) return;
    onfix(fix.apply(content));
  }

  function handleOpenInEditor(e: MouseEvent, line: number) {
    e.stopPropagation();
    onopenateditor?.(line);
  }
</script>

{#if hasErrors}
  <div class="problems-panel">
    <button
      class="header"
      onclick={() => collapsed = !collapsed}
      aria-expanded={!collapsed}
      aria-controls="problems-list"
    >
      <span class="title">PROBLEMS ({errors.length})</span>
      <span class="toggle" aria-hidden="true">{collapsed ? '+' : '─'}</span>
    </button>
    {#if !collapsed}
      <ul class="problems-list" id="problems-list" role="list">
        {#each errors as err}
          {@const fix = content ? suggestFix(content, err) : null}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li
            class="problem-row"
            class:clickable={!!onjumpline}
            role="listitem"
            onclick={() => handleRowClick(err.line)}
            onkeydown={(e) => e.key === 'Enter' && handleRowClick(err.line)}
            tabindex={onjumpline ? 0 : undefined}
            title={onjumpline ? `Jump to line ${err.line}` : undefined}
          >
            <span class="glyph" aria-label="Error">×</span>
            <span class="location">line {err.line}</span>
            <span class="message">{err.message}</span>
            {#if err.suggestion}
              <span class="fix-hint" aria-hidden="true">[↵]</span>
            {/if}
            {#if fix && onfix}
              <button
                class="action-btn fix-btn"
                onclick={(e) => handleFix(e, err.line)}
                title={fix.label}
                aria-label="Fix: {fix.label}"
              >{fix.label}</button>
            {/if}
            {#if onopenateditor && err.line > 0}
              <button
                class="action-btn problem-editor-btn"
                onclick={(e) => handleOpenInEditor(e, err.line)}
                title="Open in Editor at line {err.line}"
                aria-label="Open in Editor at line {err.line}"
              >↗ editor</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{:else if lineCount > 0}
  <div class="problems-ok" role="status">
    <span class="ok-glyph" aria-hidden="true">✓</span>
    <span>no problems</span>
  </div>
{/if}

<style>
  .problems-panel {
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
    text-align: left;
    letter-spacing: 0.05em;
  }
  .header:hover { background: var(--border); }
  .problems-list {
    list-style: none;
    margin: 0;
    padding: 0 16px 8px;
    max-height: 140px;
    overflow-y: auto;
  }
  .problem-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 4px;
    font-size: 13px;
    border-radius: 2px;
  }
  .problem-row.clickable {
    cursor: pointer;
  }
  .problem-row.clickable:hover { background: var(--border); }
  .problem-row.clickable:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .glyph { color: var(--err); flex-shrink: 0; }
  .location { color: var(--ink-dim); font-size: 12px; white-space: nowrap; }
  .message { color: var(--ink); flex: 1; }
  .fix-hint {
    font-size: 11px;
    color: var(--accent);
    opacity: 0.6;
    white-space: nowrap;
  }
  .action-btn {
    background: none;
    border: 1px solid;
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    padding: 1px 6px;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.4;
  }
  .action-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .fix-btn {
    color: var(--ok);
    border-color: var(--ok);
  }
  .fix-btn:hover {
    background: color-mix(in srgb, var(--ok) 12%, transparent);
  }
  .problem-editor-btn {
    color: var(--accent);
    border-color: var(--accent);
    opacity: 0.8;
  }
  .problem-editor-btn:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .problems-ok {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--ink-dim);
  }
  .ok-glyph { color: var(--ok); }
</style>
