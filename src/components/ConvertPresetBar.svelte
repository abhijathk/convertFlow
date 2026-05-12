<script lang="ts">
  import { convertState } from '../stores/convertState';
  import presetsJson from '../data/presets.json';

  interface Props {
    onpresetchange?: (presetId: string) => void;
  }

  let { onpresetchange }: Props = $props();

  let dropdownOpen = $state(false);
  let dropdownEl: HTMLDivElement | undefined = $state();

  let preset = $derived(presetsJson.find((p) => p.id === $convertState.presetId) ?? presetsJson[0]);
  let daysSinceVerified = $derived(
    preset ? Math.floor((Date.now() - new Date(preset.lastVerified).getTime()) / 86400000) : 0
  );
  let isStale = $derived(daysSinceVerified > 60);

  // Group presets by provider for the dropdown
  const providers = [...new Set(presetsJson.map((p) => p.provider))];
  function presetsForProvider(provider: string) {
    return presetsJson.filter((p) => p.provider === provider);
  }

  function selectPreset(id: string) {
    convertState.update((s) => ({ ...s, presetId: id }));
    onpresetchange?.(id);
    dropdownOpen = false;
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dropdownOpen = false;
  }

  function handleOutsideClick(e: MouseEvent) {
    if (dropdownEl && !dropdownEl.contains(e.target as Node)) {
      dropdownOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleOutsideClick} />

<div class="preset-bar">
  <div class="left" bind:this={dropdownEl}>
    <span class="label">preset:</span>
    <button
      class="picker"
      class:open={dropdownOpen}
      aria-label="Select provider preset"
      aria-haspopup="listbox"
      aria-expanded={dropdownOpen}
      onclick={(e) => { e.stopPropagation(); toggleDropdown(); }}
    >
      <span class="dot" aria-hidden="true">●</span>
      <span class="name">{preset?.name ?? 'Select preset'}</span>
      <span class="arrow" aria-hidden="true">{dropdownOpen ? '▴' : '▾'}</span>
    </button>

    {#if dropdownOpen}
      <div class="dropdown" role="listbox" aria-label="Provider presets">
        {#each providers as provider}
          <div class="provider-group">
            <span class="provider-label">{provider}</span>
            {#each presetsForProvider(provider) as p}
              <button
                role="option"
                aria-selected={p.id === $convertState.presetId}
                class="preset-option"
                class:selected={p.id === $convertState.presetId}
                onclick={() => selectPreset(p.id)}
              >
                <span class="option-name">{p.name}</span>
                <span class="option-price">${p.pricing.trainingPerMTokens}/M</span>
              </button>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="right">
    {#if isStale}
      <span class="warn" title="Pricing may have changed — verify before relying on cost estimates">⚠ verify</span>
    {/if}
  </div>
</div>

<style>
  .preset-bar {
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
    min-width: 280px;
    max-height: 320px;
    overflow-y: auto;
    z-index: 50;
    padding: 4px 0;
  }

  .provider-group { padding: 4px 0; }

  .provider-group + .provider-group {
    border-top: 1px solid var(--border);
  }

  .provider-label {
    display: block;
    padding: 4px 12px 2px;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .preset-option {
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

  .preset-option:hover { background: var(--border); }
  .preset-option.selected { color: var(--accent); }
  .preset-option.selected::before { content: '✓ '; }

  .option-name { flex: 1; }
  .option-price { font-size: 12px; color: var(--ink-dim); white-space: nowrap; font-variant-numeric: tabular-nums; }

  .right { display: flex; align-items: center; gap: 8px; }
  .verified { font-size: 12px; color: var(--ink-dim); }
  .warn { font-size: 12px; color: var(--warn); cursor: help; }
</style>
