<script lang="ts">
  import { shellState, closePalette, dispatchPaletteAction, toggleTheme, setTab, paletteQuery } from '../stores/shellState';
  import { TOOLS } from '../lib/utilities/registry';
  import { selectedUtilityId } from '../stores/utilitiesState';
  import { convertState, type ExportFormat } from '../stores/convertState';
  import { chunkState, type ChunkStrategy } from '../stores/chunkState';
  import { toggleSplitPane, setSplitPaneFormat, toggleBottomPanel, setBottomPanelTab, openFile as editorOpenFile } from '../stores/editorState';
  import { shortcut } from '../lib/platform';

  let selectedIndex = $state(0);
  let query = $derived($paletteQuery);

  let isOpen = $derived($shellState.paletteOpen);
  let tab = $derived($shellState.activeTab);

  // ── Global (always available) ────────────────────────────────────────────
  const globalActions = [
    { label: 'Toggle theme (light/dark)', shortcut: shortcut('T'), handler: () => toggleTheme() },
    { label: 'Switch to Convert tab', shortcut: shortcut('1'), handler: () => setTab('convert') },
    { label: 'Switch to Chunk tab', shortcut: shortcut('2'), handler: () => setTab('chunk') },
    { label: 'Switch to Editor tab', shortcut: shortcut('3'), handler: () => setTab('editor') },
    { label: 'Switch to Utilities tab', shortcut: shortcut('4'), handler: () => setTab('utilities') },
    { label: 'Open help docs (new tab)', shortcut: '', handler: () => window.open('/help', '_blank') },
    { label: 'Open privacy policy (new tab)', shortcut: '', handler: () => window.open('/privacy', '_blank') },
  ];

  // ── Convert tab ──────────────────────────────────────────────────────────
  const exportFormats: ExportFormat[] = ['jsonl', 'json', 'csv', 'tsv', 'parquet', 'md', 'txt', 'alpaca', 'sharegpt'];
  const convertFormatActions = exportFormats.map(fmt => ({
    label: `Convert: export as ${fmt.toUpperCase()}`,
    shortcut: '',
    handler: () => convertState.update(s => ({ ...s, exportFormat: fmt })),
  }));

  const convertActions = [
    ...convertFormatActions,
    { label: 'Convert: calculate exact tokens', shortcut: shortcut('↵'), handler: () => dispatchPaletteAction({ type: 'exact-tokens' }) },
    { label: 'Convert: copy share link', shortcut: '', handler: () => dispatchPaletteAction({ type: 'copy-share' }) },
    { label: 'Convert: toggle CSV header row', shortcut: '', handler: () => convertState.update(s => ({ ...s, formatSettings: { ...s.formatSettings, csv: { ...s.formatSettings.csv, header: !s.formatSettings.csv.header } } })) },
    { label: 'Convert: toggle TSV header row', shortcut: '', handler: () => convertState.update(s => ({ ...s, formatSettings: { ...s.formatSettings, tsv: { ...s.formatSettings.tsv, header: !s.formatSettings.tsv.header } } })) },
  ];

  // ── Chunk tab ────────────────────────────────────────────────────────────
  const strategies: ChunkStrategy[] = ['fixed', 'paragraph', 'semantic'];
  const chunkStrategyActions = strategies.map(strat => ({
    label: `Chunk: use ${strat} strategy`,
    shortcut: '',
    handler: () => chunkState.update(s => ({ ...s, strategy: strat })),
  }));
  const chunkSizes = [256, 512, 1024, 2048];
  const chunkSizeActions = chunkSizes.map(size => ({
    label: `Chunk: set size to ${size} tokens`,
    shortcut: '',
    handler: () => chunkState.update(s => ({ ...s, chunkSize: size })),
  }));
  const chunkOverlapActions = [0, 10, 15, 20].map(pct => ({
    label: `Chunk: set overlap to ${pct}%`,
    shortcut: '',
    handler: () => chunkState.update(s => ({ ...s, chunkOverlap: Math.round(s.chunkSize * pct / 100) })),
  }));

  const chunkActions = [
    ...chunkStrategyActions,
    ...chunkSizeActions,
    ...chunkOverlapActions,
  ];

  // ── Editor tab ───────────────────────────────────────────────────────────
  const splitFormats = ['jsonl', 'csv', 'json', 'md', 'txt', 'alpaca', 'sharegpt'] as const;
  const editorSplitFormatActions = splitFormats.map(fmt => ({
    label: `Editor: preview split as ${fmt.toUpperCase()}`,
    shortcut: '',
    handler: () => setSplitPaneFormat(fmt),
  }));

  const editorActions = [
    { label: 'Editor: new untitled file', shortcut: '', handler: () => editorOpenFile(`untitled-${Date.now()}.txt`, '') },
    { label: 'Editor: toggle split pane', shortcut: '', handler: () => toggleSplitPane() },
    ...editorSplitFormatActions,
    { label: 'Editor: open Linter panel', shortcut: '', handler: () => setBottomPanelTab('linter') },
    { label: 'Editor: open Find panel', shortcut: '', handler: () => setBottomPanelTab('find') },
    { label: 'Editor: toggle bottom panel', shortcut: '', handler: () => toggleBottomPanel() },
  ];

  // ── Utilities (always available) ─────────────────────────────────────────
  const utilityToolActions = TOOLS.map(t => ({
    label: `Utility: ${t.name}`,
    shortcut: '',
    handler: () => { selectedUtilityId.set(t.id); setTab('utilities'); },
  }));

  let actions = $derived(
    tab === 'convert' ? [...convertActions, ...globalActions, ...utilityToolActions]
    : tab === 'chunk' ? [...chunkActions, ...globalActions, ...utilityToolActions]
    : tab === 'editor' ? [...editorActions, ...globalActions, ...utilityToolActions]
    : [...globalActions, ...utilityToolActions],
  );

  let filtered = $derived(
    query.trim()
      ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
      : actions
  );

  $effect(() => {
    if (query) selectedIndex = 0;
  });

  let anchorRect = $state<{ top: number; left: number; width: number } | null>(null);

  function updateAnchor() {
    const el = document.querySelector('.cmd-input') as HTMLElement | null;
    if (!el) { anchorRect = null; return; }
    const r = el.getBoundingClientRect();
    anchorRect = { top: r.bottom, left: r.left, width: r.width };
  }

  $effect(() => {
    if (isOpen) {
      updateAnchor();
      window.addEventListener('resize', updateAnchor);
      window.addEventListener('scroll', updateAnchor, true);
    } else {
      selectedIndex = 0;
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') { closePalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); return; }
    if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].handler();
      closePalette();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('backdrop')) {
      closePalette();
    }
  }

  function selectAction(action: { label: string; shortcut: string; handler: () => void }) {
    action.handler();
    closePalette();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1">
    <div
      class="palette"
      style={anchorRect
        ? `top: ${anchorRect.top}px; left: ${anchorRect.left}px; width: ${anchorRect.width}px;`
        : ''}
    >
      <ul class="results" id="palette-results" role="listbox">
        {#each filtered as action, i}
          <li
            role="option"
            aria-selected={i === selectedIndex}
            class:selected={i === selectedIndex}
            onclick={() => selectAction(action)}
          >
            <span class="label">{action.label}</span>
            {#if action.shortcut}
              <span class="shortcut">{action.shortcut}</span>
            {/if}
          </li>
        {/each}
        {#if filtered.length === 0}
          <li class="empty" role="option" aria-selected="false">no results</li>
        {/if}
      </ul>
      <div class="footer" aria-label="Keyboard hints">
        <span>↑↓ navigate</span>
        <span aria-hidden="true">·</span>
        <span>↵ select</span>
        <span aria-hidden="true">·</span>
        <span>esc close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 100;
  }
  .palette {
    position: fixed;
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 4px 4px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  }
  .input-row {
    display: flex;
    align-items: center;
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
    height: 32px;
    gap: 8px;
    flex-shrink: 0;
  }
  .prompt { color: var(--accent); font-size: 13px; }
  input {
    flex: 1;
    background: none;
    border: none;
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;
    outline: none;
  }
  input::placeholder { color: var(--muted); }
  .results {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    flex: 1;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    color: var(--ink);
  }
  li:hover, li.selected { background: var(--border); }
  .shortcut { color: var(--accent); font-size: 12px; }
  .empty { color: var(--ink-dim); font-style: italic; }
  .footer {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--ink-dim);
    flex-shrink: 0;
  }
</style>
