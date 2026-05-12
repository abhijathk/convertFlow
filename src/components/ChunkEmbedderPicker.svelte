<script lang="ts">
  import { chunkState } from '../stores/chunkState';
  import embeddersJson from '../data/embedders.json';
  import { formatEmbeddingCost, formatTokens } from '../lib/pricing';

  let dropdownOpen = $state(false);
  let dropdownEl: HTMLDivElement | undefined = $state();

  let embedder = $derived(embeddersJson.find(e => e.id === $chunkState.embedderId) ?? embeddersJson[0]);
  let totalTokens = $derived($chunkState.chunks.reduce((sum, c) => sum + c.approx_tokens, 0));
  let costLabel = $derived(
    totalTokens > 0
      ? `Embedding cost ≈ ${formatEmbeddingCost(totalTokens, $chunkState.embedderId)} (${formatTokens(totalTokens)} tokens)`
      : null
  );

  const providers = [...new Set(embeddersJson.map(e => e.provider))];
  function embeddersForProvider(provider: string) {
    return embeddersJson.filter(e => e.provider === provider);
  }

  function selectEmbedder(id: string) {
    chunkState.update(s => ({ ...s, embedderId: id }));
    dropdownOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dropdownOpen = false;
  }

  function handleOutsideClick(e: MouseEvent) {
    if (dropdownEl && !dropdownEl.contains(e.target as Node)) dropdownOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleOutsideClick} />

<div class="embedder-bar">
  <div class="left" bind:this={dropdownEl}>
    <span class="label">embedder:</span>
    <button
      class="picker"
      class:open={dropdownOpen}
      aria-label="Select embedder model"
      aria-haspopup="listbox"
      aria-expanded={dropdownOpen}
      onclick={(e) => { e.stopPropagation(); dropdownOpen = !dropdownOpen; }}
    >
      <span class="dot" aria-hidden="true">●</span>
      <span class="name">{embedder?.name ?? '—'}</span>
      <span class="arrow" aria-hidden="true">{dropdownOpen ? '▴' : '▾'}</span>
    </button>

    {#if dropdownOpen}
      <div class="dropdown" role="listbox" aria-label="Embedder models">
        {#each providers as provider}
          <div class="provider-group">
            <span class="provider-label">{provider}</span>
            {#each embeddersForProvider(provider) as e}
              <button
                role="option"
                aria-selected={e.id === $chunkState.embedderId}
                class="embed-option"
                class:selected={e.id === $chunkState.embedderId}
                onclick={() => selectEmbedder(e.id)}
              >
                <span class="option-name">{e.name}</span>
                <span class="option-price">
                  {e.pricePerMTokens === 0 ? 'free' : `$${e.pricePerMTokens.toFixed(3)}/M`}
                </span>
              </button>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="right">
    {#if costLabel}
      <span class="cost-estimate">{costLabel}</span>
    {:else if embedder?.pricePerMTokens === 0}
      <span class="free">free (local)</span>
    {/if}
  </div>
</div>

<style>
  .embedder-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 36px;
    padding: 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: relative;
    z-index: 20;
  }
  .left {
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
  }
  .label { font-size: 13px; color: var(--ink-dim); }
  .picker {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink);
    padding: 4px 6px;
    border-radius: 2px;
  }
  .picker:hover, .picker.open { background: var(--border); }
  .dot { color: var(--accent); font-size: 10px; }
  .arrow { color: var(--ink-dim); font-size: 10px; }
  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    min-width: 300px;
    max-height: 320px;
    overflow-y: auto;
    z-index: 50;
    padding: 4px 0;
  }
  .provider-group { padding: 4px 0; }
  .provider-group + .provider-group { border-top: 1px solid var(--border); }
  .provider-label {
    display: block;
    padding: 4px 12px 2px;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .embed-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink);
    text-align: left;
    gap: 12px;
  }
  .embed-option:hover { background: var(--border); }
  .embed-option.selected { color: var(--accent); }
  .embed-option.selected::before { content: '✓ '; }
  .option-name { flex: 1; }
  .option-price { font-size: 12px; color: var(--ink-dim); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .right { display: flex; align-items: center; gap: 8px; }
  .price { font-size: 12px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .free { font-size: 12px; color: var(--ok); }
  .dim { font-size: 12px; color: var(--ink-dim); }
  .cost-estimate { font-size: 12px; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
</style>
