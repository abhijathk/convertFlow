<script lang="ts">
  import { shellState } from '../stores/shellState';
  import { convertState } from '../stores/convertState';
  import { chunkState } from '../stores/chunkState';
  import { shortcut } from '../lib/platform';
  import embeddersJson from '../data/embedders.json';

  let kEnter = $state('⌘↵');
  let kK = $state('⌘K');
  $effect(() => { kEnter = shortcut('↵'); kK = shortcut('K'); });

  let tab = $derived($shellState.activeTab);
  let cs = $derived($convertState);
  let ch = $derived($chunkState);

  let avgDensity = $derived(
    ch.chunks.length > 0
      ? ch.chunks.reduce((a, c) => a + c.density_score, 0) / ch.chunks.length
      : 0
  );

  let totalChunkTokens = $derived(ch.chunks.reduce((a, c) => a + c.approx_tokens, 0));

  let embedder = $derived(embeddersJson.find(e => e.id === ch.embedderId) ?? embeddersJson[0]);

  let embeddingCost = $derived(
    embedder && totalChunkTokens > 0 && embedder.pricePerMTokens > 0
      ? (totalChunkTokens / 1_000_000) * embedder.pricePerMTokens
      : null
  );
</script>

<footer class="statusbar" role="status" aria-label="Tool status">
  {#if tab === 'convert'}
    <div class="left">
      {#if cs.lineCount > 0}
        <span>{cs.lineCount} lines</span>
        {#if cs.errors.length > 0}
          <span class="sep">·</span>
          <span class="err-count">{cs.errors.length} error{cs.errors.length === 1 ? '' : 's'}</span>
        {:else}
          <span class="sep">·</span>
          <span class="ok-count">✓ no errors</span>
        {/if}
      {:else}
        <span class="dim">— lines</span>
      {/if}
    </div>
    <div class="right" aria-live="polite">
      {#if cs.exactTokens !== null}
        <span class="accent tabular">{cs.exactTokens.toLocaleString()}t exact</span>
        {#if cs.cost !== null}
          <span class="sep">·</span>
          <span class="accent tabular">${cs.cost.toFixed(2)}</span>
        {/if}
      {:else if cs.approximateTokens !== null}
        <span class="accent tabular">≈ {cs.approximateTokens.toLocaleString()}t</span>
        {#if cs.cost !== null}
          <span class="sep">·</span>
          <span class="accent tabular">≈ ${cs.cost.toFixed(2)}</span>
        {/if}
        <span class="sep">·</span>
        <span class="dim">{kEnter} for exact</span>
      {:else}
        <span class="dim">— tokens · — cost</span>
      {/if}
      <span class="divider" aria-hidden="true"></span>
      <span class="dim">{kK}</span>
    </div>
  {:else if tab === 'chunk'}
    <div class="left">
      {#if ch.chunks.length > 0}
        <span class="ok-count">{ch.chunks.length} chunks</span>
        <span class="sep">·</span>
        <span>{totalChunkTokens.toLocaleString()}t total</span>
        <span class="sep">·</span>
        <span>avg density {avgDensity.toFixed(2)}</span>
      {:else if ch.parseStatus === 'parsing'}
        <span class="dim">chunking…</span>
      {:else}
        <span class="dim">— chunks</span>
      {/if}
    </div>
    <div class="right" aria-live="polite">
      {#if embeddingCost !== null}
        <span class="accent tabular">≈ ${embeddingCost.toFixed(4)} embed</span>
        <span class="divider" aria-hidden="true"></span>
      {/if}
      <span class="dim">{kK}</span>
    </div>
  {:else}
    <div class="left">
      <span class="info-icon" aria-hidden="true">&#9432;</span>
      <span class="dim">Files processed entirely in your browser — nothing is uploaded</span>
      <span class="sep">·</span>
      <span class="dim">Never leaves your machine</span>
      <span class="sep">·</span>
      <a href="/privacy" target="_blank" rel="noopener noreferrer" class="privacy-link">Privacy policy</a>
    </div>
    <div class="right" aria-live="polite">
      <span class="dim">{kK}</span>
    </div>
  {/if}
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
    padding: 0 16px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    font-size: 12px;
    flex-shrink: 0;
  }
  .left, .right {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sep { color: var(--muted); }
  .dim { color: var(--ink-dim); }
  .accent { color: var(--accent); }
  .tabular { font-variant-numeric: tabular-nums; }
  .err-count { color: var(--err); }
  .ok-count { color: var(--ok); }
  .divider {
    display: inline-block;
    width: 1px;
    height: 12px;
    background: var(--border);
    margin: 0 4px;
  }
  .privacy-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 12px;
  }
  .privacy-link:hover { text-decoration: underline; }
  .info-icon {
    color: var(--muted);
    font-size: 13px;
    line-height: 1;
  }
</style>
