<script lang="ts">
  import { chunkState } from '../stores/chunkState';
  import { computeChunkStats, type ChunkStats } from '../lib/chunk-stats';
  import { generateChunkSummary, type ChunkSummary } from '../lib/chunk-summary';

  let stats = $state<ChunkStats | null>(null);
  let summary = $state<ChunkSummary | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const chunks = $chunkState.chunks;
    const sourceText = $chunkState.sourceText;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (chunks.length === 0) { stats = null; summary = null; return; }
    debounceTimer = setTimeout(() => {
      stats = computeChunkStats(chunks, sourceText);
      summary = generateChunkSummary(stats);
    }, 200);
    return () => { if (debounceTimer) clearTimeout(debounceTimer); };
  });

  type Status = 'ok' | 'warn' | 'err';

  function tokenSizeStatus(s: ChunkStats): Status {
    if (s.totalChunks === 0) return 'ok';
    // Warn if median is < 64 (too small for embeddings) or > 2048 (too large for most context windows)
    if (s.tokenLengths.median < 64) return 'warn';
    if (s.tokenLengths.median > 2048) return 'warn';
    return 'ok';
  }

  function varianceStatus(s: ChunkStats): Status {
    if (s.totalChunks < 2) return 'ok';
    // Coefficient of variation > 0.5 means chunks are wildly inconsistent
    if (s.sizeVariance.cv > 0.7) return 'err';
    if (s.sizeVariance.cv > 0.4) return 'warn';
    return 'ok';
  }

  function densityStatus(s: ChunkStats): Status {
    if (s.totalChunks === 0) return 'ok';
    if (s.lowDensityCount > s.totalChunks * 0.2) return 'err';
    if (s.lowDensityCount > 0) return 'warn';
    return 'ok';
  }

  function coverageStatus(s: ChunkStats): Status {
    if (s.coverage.sourceLength === 0) return 'ok';
    if (s.coverage.coveragePct < 0.80) return 'err';
    if (s.coverage.coveragePct < 0.95) return 'warn';
    return 'ok';
  }

  function overlapStatus(s: ChunkStats): Status {
    // High overlap wastes embedding cost; >40% is wasteful
    if (s.overlap.overlapPct > 0.4) return 'warn';
    return 'ok';
  }
</script>

<div class="stats-panel" role="region" aria-label="Chunk statistics">
  {#if !stats}
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">◌</span>
      <span>No chunks yet — import a file and click Generate.</span>
    </div>
  {:else}
    {@const s = stats}
    {#if summary}
      <div class="summary-card summary-{summary.status}" role="region" aria-label="Chunk summary">
        <div class="summary-header">
          <span class="summary-icon" aria-hidden="true">
            {summary.status === 'err' ? '⚠' : summary.status === 'warn' ? '◯' : '✓'}
          </span>
          <span class="summary-tldr">{summary.tldr}</span>
        </div>
        {#if summary.bullets.length > 0}
          <ul class="summary-bullets">
            {#each summary.bullets as b}
              <li class="summary-bullet bullet-{b.status}">{b.text}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
    <div class="stats-grid">

      <!-- Overview -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Chunks</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        <div class="card-big">{s.totalChunks.toLocaleString()}</div>
        <div class="card-detail">
          <span>{s.totalTokens.toLocaleString()} total tokens</span>
          <span>{s.totalChars.toLocaleString()} total chars</span>
        </div>
      </div>

      <!-- Token Length Distribution -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Token Lengths</span>
          <span class="dot dot-{tokenSizeStatus(s)}" aria-label="Status: {tokenSizeStatus(s)}"></span>
        </div>
        <div class="card-big">{s.tokenLengths.median.toLocaleString()}<span class="big-suffix">p50</span></div>
        <div class="card-detail">
          <span>min {s.tokenLengths.min} · max {s.tokenLengths.max}</span>
          <span>mean {s.tokenLengths.mean} · p95 {s.tokenLengths.p95}</span>
          {#if s.tokenLengths.median < 64}
            <span class="flag-warn">very small chunks — may hurt embedding quality</span>
          {:else if s.tokenLengths.median > 2048}
            <span class="flag-warn">very large chunks — may exceed model context</span>
          {/if}
        </div>
      </div>

      <!-- Size Variance -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Size Consistency</span>
          <span class="dot dot-{varianceStatus(s)}" aria-label="Status: {varianceStatus(s)}"></span>
        </div>
        <div class="card-big">{(s.sizeVariance.cv * 100).toFixed(0)}<span class="big-suffix">% CV</span></div>
        <div class="card-detail">
          <span>stdev {s.sizeVariance.stdev} tokens</span>
          {#if s.sizeVariance.cv > 0.7}
            <span class="flag-err">very inconsistent — some chunks much larger than others</span>
          {:else if s.sizeVariance.cv > 0.4}
            <span class="flag-warn">somewhat uneven</span>
          {:else}
            <span class="ok-text">chunks are consistent</span>
          {/if}
        </div>
      </div>

      <!-- Density -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Density</span>
          <span class="dot dot-{densityStatus(s)}" aria-label="Status: {densityStatus(s)}"></span>
        </div>
        <div class="card-big">{s.density.mean.toFixed(2)}<span class="big-suffix">avg</span></div>
        <div class="card-detail">
          <span>range {s.density.min.toFixed(2)} — {s.density.max.toFixed(2)}</span>
          {#if s.lowDensityCount > 0}
            <span class="flag-warn">{s.lowDensityCount} low-density chunk{s.lowDensityCount === 1 ? '' : 's'} (&lt; 0.3) — sparse content</span>
          {:else}
            <span class="ok-text">all chunks information-rich</span>
          {/if}
        </div>
      </div>

      <!-- Overlap -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Overlap Waste</span>
          <span class="dot dot-{overlapStatus(s)}" aria-label="Status: {overlapStatus(s)}"></span>
        </div>
        <div class="card-big">{(s.overlap.overlapPct * 100).toFixed(1)}<span class="big-suffix">%</span></div>
        <div class="card-detail">
          <span>≈ {s.overlap.tokenOverlap.toLocaleString()} duplicated tokens</span>
          {#if s.overlap.overlapPct > 0.4}
            <span class="flag-warn">high overlap — you'll pay to embed the same text multiple times</span>
          {:else}
            <span class="dim">overlap helps retrieval context — this is intentional</span>
          {/if}
        </div>
      </div>

      <!-- Coverage -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Coverage</span>
          <span class="dot dot-{coverageStatus(s)}" aria-label="Status: {coverageStatus(s)}"></span>
        </div>
        <div class="card-big">{(s.coverage.coveragePct * 100).toFixed(1)}<span class="big-suffix">% of source</span></div>
        <div class="card-detail">
          <span>{s.coverage.coveredLength.toLocaleString()} / {s.coverage.sourceLength.toLocaleString()} chars</span>
          {#if s.coverage.gapCount > 0}
            <span class="flag-warn">{s.coverage.gapCount} gap{s.coverage.gapCount === 1 ? '' : 's'} — source text not in any chunk</span>
          {:else}
            <span class="ok-text">no gaps — full source covered</span>
          {/if}
        </div>
      </div>

      <!-- Image vs Text Chunks -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Composition</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        <div class="card-big">{s.textChunks}<span class="big-suffix">text</span></div>
        <div class="card-detail">
          {#if s.imageChunks > 0}
            <span>+ {s.imageChunks} image chunk{s.imageChunks === 1 ? '' : 's'}</span>
          {:else}
            <span class="dim">no image chunks</span>
          {/if}
        </div>
      </div>

      <!-- Keywords -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Topic Breadth</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        <div class="card-big">{s.keywords.uniqueCount.toLocaleString()}<span class="big-suffix">unique kw</span></div>
        <div class="card-detail">
          <span>{s.keywords.totalKeywords} keyword instances across chunks</span>
          {#if s.keywords.topKeywords.length > 0}
            <span class="dim">top: {s.keywords.topKeywords.slice(0, 5).map(k => `${k.keyword} (${k.count})`).join(' · ')}</span>
          {/if}
        </div>
      </div>

    </div>
  {/if}
</div>

<style>
  .stats-panel {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: var(--bg);
    min-height: 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 200px;
    color: var(--muted);
    font-size: 13px;
  }

  .empty-icon {
    font-size: 24px;
    color: var(--muted);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-label {
    font-size: 11px;
    color: var(--ink-dim);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-ok   { background: var(--ok); }
  .dot-warn { background: var(--warn); }
  .dot-err  { background: var(--err); }

  .card-big {
    font-size: 22px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: baseline;
    gap: 4px;
    line-height: 1;
  }

  .big-suffix {
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-dim);
  }

  .card-detail {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--ink-dim);
  }

  .flag-err  { color: var(--err); }
  .flag-warn { color: var(--warn); }
  .ok-text   { color: var(--ok); }
  .dim       { color: var(--muted); }

  /* Summary card */
  .summary-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 16px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .summary-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .summary-icon {
    font-size: 14px;
    flex-shrink: 0;
    line-height: 1;
  }
  .summary-ok  .summary-icon { color: var(--ok); }
  .summary-warn .summary-icon { color: var(--warn); }
  .summary-err  .summary-icon { color: var(--err); }
  .summary-tldr {
    font-size: 13px;
    color: var(--ink);
    line-height: 1.5;
    font-weight: 500;
  }
  .summary-bullets {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .summary-bullet {
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.5;
    padding: 4px 8px 4px 22px;
    position: relative;
    border-radius: 3px;
  }
  .summary-bullet::before {
    content: '•';
    position: absolute;
    left: 8px;
    top: 4px;
    color: var(--muted);
    font-weight: 700;
  }
  .bullet-err {
    color: var(--err);
    background: color-mix(in srgb, var(--err) 10%, transparent);
    font-weight: 500;
  }
  .bullet-err::before {
    content: '⚠';
    color: var(--err);
    font-size: 11px;
    top: 5px;
  }
  .bullet-warn {
    color: var(--warn);
    background: color-mix(in srgb, var(--warn) 8%, transparent);
  }
  .bullet-warn::before {
    content: '◯';
    color: var(--warn);
    font-size: 10px;
    top: 5px;
  }
  .bullet-ok::before {
    color: var(--ok);
  }

  /* Responsive: 2-col on medium, 1-col on mobile */
  @media (max-width: 960px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 600px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
