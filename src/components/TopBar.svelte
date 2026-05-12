<script lang="ts">
  import { onMount } from 'svelte';
  import { toggleTheme, openPalette, closePalette, shellState, paletteQuery } from '../stores/shellState';
  import { shortcut } from '../lib/platform';
  import { getActiveFile } from '../stores/editorState';
  import { convertState } from '../stores/convertState';
  import { chunkState } from '../stores/chunkState';
  import { encodeConvertShare, encodeEditorShare, encodeChunkShare } from '../lib/share-url';

  const TOUR_KEY = 'dataprep:tour-seen';

  let kT = $state('⌘T');
  let kK = $state('⌘K');
  $effect(() => { kT = shortcut('T'); kK = shortcut('K'); });

  let shareFeedback = $state('');
  let shareTimer: ReturnType<typeof setTimeout> | undefined;
  let showTour = $state(false);

  onMount(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      showTour = true;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== '?') return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
    e.preventDefault();
    window.open('/help', '_blank');
  }

  function copyShare() {
    const tab = $shellState.activeTab;
    let encoded = '';
    let param = '';

    if (tab === 'convert') {
      const s = $convertState;
      if (!s.editorContent.trim()) return;
      encoded = encodeConvertShare(s.presetId, s.editorContent);
      param = `t=convert&s=${encoded}`;
    } else if (tab === 'chunk') {
      const s = $chunkState;
      encoded = encodeChunkShare(s.strategy, s.embedderId, s.chunkSize, s.chunkOverlap);
      param = `t=chunk&s=${encoded}`;
    } else if (tab === 'editor') {
      const file = getActiveFile();
      if (!file) return;
      encoded = encodeEditorShare(file.name, file.content);
      param = `t=editor&s=${encoded}`;
    } else if (tab === 'utilities') {
      param = `t=utilities`;
    }

    if (!param) {
      if (shareTimer) clearTimeout(shareTimer);
      shareFeedback = 'nothing to share';
      shareTimer = setTimeout(() => (shareFeedback = ''), 2200);
      return;
    }
    const url = `${location.origin}${location.pathname}#${param}`;
    navigator.clipboard.writeText(url).then(() => {
      if (shareTimer) clearTimeout(shareTimer);
      shareFeedback = 'link copied';
      shareTimer = setTimeout(() => (shareFeedback = ''), 2200);
    });
  }

  function startTour() {
    showTour = true;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<header class="topbar">
  <a href="/" class="brand">convertFlow</a>

  <div class="cmd-center">
    <div class="cmd-input" class:open={$shellState.paletteOpen}>
      <span class="cmd-icon" aria-hidden="true">&gt;</span>
      <input
        type="text"
        class="cmd-input-field"
        placeholder="type a command…"
        value={$paletteQuery}
        oninput={(e) => paletteQuery.set(e.currentTarget.value)}
        onfocus={() => openPalette()}
        onclick={() => openPalette()}
        onkeydown={(e) => { if (e.key === 'Escape') { closePalette(); (e.currentTarget as HTMLInputElement).blur(); } }}
        autocomplete="off"
        spellcheck="false"
        aria-label="Command palette ({kK})"
        aria-expanded={$shellState.paletteOpen}
        role="combobox"
        aria-controls="palette-results"
      />
      <kbd>{kK}</kbd>
    </div>
  </div>

  <nav class="actions">
    <button
      onclick={copyShare}
      aria-label="Copy share link for current tab"
      class:share-ok={!!shareFeedback}
      title="Share current state as a URL"
    >{shareFeedback ? shareFeedback : 'share'}</button>
    <span class="sep" aria-hidden="true">·</span>
    <button onclick={startTour} aria-label="Start guided tour">tour ?</button>
    <span class="sep" aria-hidden="true">·</span>
    <button onclick={() => toggleTheme()} aria-label="Toggle theme ({kT})">
      theme <kbd>{kT}</kbd>
    </button>
    <span class="sep" aria-hidden="true">·</span>
    <a href="/help" target="_blank" rel="noopener noreferrer" aria-label="Help and documentation">
      help <kbd>?</kbd>
    </a>
  </nav>
</header>

{#if showTour}
  {#await import('./Tour.svelte') then { default: Tour }}
    <Tour onclose={() => (showTour = false)} />
  {/await}
{/if}

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 12px;
  }
  .brand {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: 0.01em;
    text-decoration: none;
    flex-shrink: 0;
  }
  .brand:hover { color: var(--accent); }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ink-dim);
    flex-shrink: 0;
  }
  .actions button,
  .actions a {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--ink-dim);
    font-family: inherit;
    font-size: 12px;
    text-decoration: none;
    white-space: nowrap;
  }
  .actions button:hover,
  .actions a:hover { color: var(--ink); }
  .actions button:focus-visible,
  .actions a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .actions button.share-ok { color: var(--ok); }
  kbd {
    color: var(--accent);
    font-family: inherit;
    font-size: 11px;
  }
  .sep { color: var(--muted); user-select: none; }

  .cmd-center {
    flex: 1;
    display: flex;
    justify-content: center;
    min-width: 0;
    padding: 0 16px;
  }
  .cmd-input {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    width: 100%;
    max-width: 420px;
    cursor: text;
    transition: border-color 0.1s;
    font-family: inherit;
  }
  .cmd-input:hover { border-color: var(--ink-dim); }
  .cmd-input:focus-within { border-color: var(--accent); }
  .cmd-input.open {
    border-color: var(--accent);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom-color: transparent;
  }
  .cmd-icon { color: var(--accent); font-size: 13px; line-height: 1; }
  .cmd-input-field {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 0;
    min-width: 0;
  }
  .cmd-input-field::placeholder { color: var(--muted); }
  .cmd-input-field:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .cmd-input kbd {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 10px;
    color: var(--ink-dim);
  }

  @media (max-width: 600px) {
    .center-area { display: none; }
    .actions .sep:not(:first-of-type) { display: none; }
    .actions button,
    .actions a {
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .actions .sep { display: none; }
    .actions {
      gap: 0;
    }
    .actions button kbd,
    .actions a kbd { display: none; }
  }
</style>
