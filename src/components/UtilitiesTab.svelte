<script lang="ts">
  import { TOOLS } from '../lib/utilities/registry';
  import { selectedUtilityId } from '../stores/utilitiesState';
  import UtilityToolPanel from './UtilityToolPanel.svelte';

  let selectedId = $state($selectedUtilityId);
  let search = $state('');

  $effect(() => { selectedId = $selectedUtilityId; });
  $effect(() => { selectedUtilityId.set(selectedId); });

  let filtered = $derived(
    search.trim()
      ? TOOLS.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
      : TOOLS
  );

  const categories = $derived([...new Set(filtered.map(t => t.category))]);

  let selectedMeta = $derived(TOOLS.find(t => t.id === selectedId) ?? TOOLS[0]);
</script>

<div class="utilities-tab">
  <aside class="sidebar">
    <div class="search-wrap">
      <input
        type="search"
        class="search-input"
        placeholder="Filter tools…"
        bind:value={search}
        aria-label="Filter utility tools"
      />
    </div>
    <nav class="tool-list" aria-label="Utility tools">
      {#each categories as cat (cat)}
        <div class="category-group">
          <span class="category-label">{cat}</span>
          {#each filtered.filter(t => t.category === cat) as tool (tool.id)}
            <button
              class="tool-item"
              class:active={selectedId === tool.id}
              onclick={() => { selectedId = tool.id; }}
              aria-pressed={selectedId === tool.id}
            >
              {tool.name}
            </button>
          {/each}
        </div>
      {/each}
      {#if filtered.length === 0}
        <p class="no-results">No tools match.</p>
      {/if}
    </nav>
  </aside>

  <main class="tool-main">
    {#if selectedMeta}
      <UtilityToolPanel meta={selectedMeta} />
    {/if}
  </main>
</div>

<style>
  .utilities-tab {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .sidebar {
    width: 200px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .search-wrap {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .search-input {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 5px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }
  .search-input:focus { border-color: var(--accent); }
  .tool-list {
    overflow-y: auto;
    flex: 1;
    padding: 8px 0;
  }
  .category-group { display: flex; flex-direction: column; }
  .category-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    padding: 8px 14px 4px;
  }
  .tool-item {
    background: none;
    border: none;
    padding: 7px 14px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink-dim);
    text-align: left;
    width: 100%;
    transition: background 0.1s, color 0.1s;
    border-radius: 0;
  }
  .tool-item:hover { background: var(--border); color: var(--ink); }
  .tool-item.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--ink);
    font-weight: 600;
  }
  .no-results {
    font-size: 12px;
    color: var(--ink-dim);
    padding: 12px 14px;
    margin: 0;
  }
  .tool-main {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }
  @media (max-width: 600px) {
    .utilities-tab { flex-direction: column; }
    .sidebar {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--border);
      max-height: 140px;
    }
  }
</style>
