<script lang="ts">
  import { convertState } from '../stores/convertState';
  import { openFile, pendingJump } from '../stores/editorState';
  import { setTab } from '../stores/shellState';
  import { computeDatasetStats, type DatasetStats } from '../lib/dataset-stats';
  import presetsJson from '../data/presets.json';

  let stats = $state<DatasetStats | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function getPreset(id: string) {
    return presetsJson.find(p => p.id === id) ?? presetsJson[0];
  }

  $effect(() => {
    const content = $convertState.editorContent;
    const presetId = $convertState.presetId;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!content.trim()) { stats = null; return; }
    debounceTimer = setTimeout(() => {
      const preset = getPreset(presetId);
      stats = computeDatasetStats(content, preset);
    }, 300);
    return () => { if (debounceTimer) clearTimeout(debounceTimer); };
  });

  function jumpToLine(line: number) {
    const content = $convertState.editorContent;
    const fileId = openFile('dataset.jsonl', content);
    pendingJump.set({ fileId, line });
    setTab('editor');
  }

  function pct(n: number, total: number): string {
    if (total === 0) return '0%';
    return ((n / total) * 100).toFixed(1) + '%';
  }

  type Status = 'ok' | 'warn' | 'err';

  function invalidStatus(s: DatasetStats): Status {
    const r = s.recordCount + s.invalidCount;
    if (r === 0) return 'ok';
    const ratio = s.invalidCount / r;
    if (ratio > 0.2) return 'err';
    if (ratio > 0) return 'warn';
    return 'ok';
  }

  function emptyStatus(s: DatasetStats): Status {
    const r = s.recordCount + s.emptyCount;
    if (r === 0) return 'ok';
    const ratio = s.emptyCount / r;
    if (ratio > 0.1) return 'err';
    if (ratio > 0) return 'warn';
    return 'ok';
  }

  function overBudgetStatus(s: DatasetStats): Status {
    if (s.recordCount === 0) return 'ok';
    const ratio = s.overBudget.count / s.recordCount;
    if (ratio > 0.05) return 'err';
    if (ratio > 0.01) return 'warn';
    return 'ok';
  }

  function duplicateStatus(s: DatasetStats): Status {
    if (s.recordCount === 0) return 'ok';
    const ratio = s.duplicates.exact / s.recordCount;
    if (ratio > 0.05) return 'err';
    if (ratio > 0) return 'warn';
    return 'ok';
  }

  function roleStatus(s: DatasetStats): Status {
    if (s.roles.total === 0) return 'ok';
    if (!s.roles.hasSystem) return 'warn';
    const userCount = s.roles.counts['user'] ?? 0;
    const assistantCount = s.roles.counts['assistant'] ?? 0;
    if (assistantCount > userCount * 1.5) return 'warn';
    return 'ok';
  }

  function contentStatus(s: DatasetStats): Status {
    if (s.content.emptyContentCount > 0) return 'warn';
    return 'ok';
  }

  function langLabel(hint: DatasetStats['languageHint']): string {
    if (hint === 'mostly-ascii') return 'Mostly English';
    if (hint === 'mostly-non-ascii') return 'Mostly non-ASCII';
    if (hint === 'cjk') return 'Mostly CJK';
    return 'Mixed';
  }

  function bucketLabel(key: string): string {
    return key === '1' ? '1 msg' : key === '2' ? '2 msg' : key === '3' ? '3 msg' : key + ' msg';
  }

  function maxBucket(buckets: Record<string, number>): number {
    return Math.max(1, ...Object.values(buckets));
  }

  const BUCKET_KEYS = ['1', '2', '3', '4-5', '6-10', '11+'];
</script>

<div class="stats-panel" role="region" aria-label="Dataset statistics">
  {#if !stats}
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">◌</span>
      <span>No data — paste JSONL content into the editor.</span>
    </div>
  {:else}
    {@const s = stats}
    <div class="stats-grid">

      <!-- Records Overview -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Records</span>
          <span class="dot dot-{invalidStatus(s)}" aria-label="Status: {invalidStatus(s)}"></span>
        </div>
        <div class="card-big">{s.recordCount.toLocaleString()}</div>
        <div class="card-detail">
          <span>{s.emptyCount} empty lines</span>
          {#if s.invalidCount > 0}
            <span class="flag-err">{s.invalidCount} invalid ({pct(s.invalidCount, s.recordCount + s.invalidCount)})</span>
            <button class="jump-btn" onclick={() => { const lines = $convertState.editorContent.split('\n'); for (let i = 0; i < lines.length; i++) { if (!lines[i].trim()) continue; try { JSON.parse(lines[i]); } catch { jumpToLine(i + 1); break; } } }}>jump to first</button>
          {:else}
            <span class="ok-text">all parseable</span>
          {/if}
        </div>
      </div>

      <!-- Token Budget -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Token Budget</span>
          <span class="dot dot-{overBudgetStatus(s)}" aria-label="Status: {overBudgetStatus(s)}"></span>
        </div>
        <div class="card-big">
          {s.recordCount > 0 ? pct(s.recordCount - s.overBudget.count, s.recordCount) : '—'}
          <span class="big-suffix">fit</span>
        </div>
        <div class="card-detail">
          <span>limit: {s.overBudget.limit.toLocaleString()} tok</span>
          {#if s.overBudget.count > 0}
            <span class="flag-err">{s.overBudget.count} over-budget</span>
            {#if s.overBudget.firstLine !== null}
              <button class="jump-btn" onclick={() => jumpToLine(s.overBudget.firstLine!)}>jump to first</button>
            {/if}
          {:else}
            <span class="ok-text">none over limit</span>
          {/if}
        </div>
      </div>

      <!-- Token Lengths -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Token Lengths</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        <div class="card-big">{s.tokenLengths.median.toLocaleString()}<span class="big-suffix">p50</span></div>
        <div class="card-detail">
          <span>min {s.tokenLengths.min} · max {s.tokenLengths.max}</span>
          <span>mean {s.tokenLengths.mean} · p95 {s.tokenLengths.p95} · p99 {s.tokenLengths.p99}</span>
        </div>
      </div>

      <!-- Duplicates -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Duplicates</span>
          <span class="dot dot-{duplicateStatus(s)}" aria-label="Status: {duplicateStatus(s)}"></span>
        </div>
        <div class="card-big">
          {s.duplicates.exact}
          <span class="big-suffix">exact</span>
        </div>
        <div class="card-detail">
          <span>{s.duplicates.normalized} near-dupes (trim+lower)</span>
          {#if s.duplicates.samples.length > 0}
            <div class="dup-samples">
              {#each s.duplicates.samples as d}
                <div class="dup-sample">
                  <button class="jump-btn" onclick={() => jumpToLine(d.firstLine)}>L{d.firstLine}</button>
                  <span class="dup-preview" title={d.preview}>{d.preview.length > 60 ? d.preview.slice(0, 60) + '…' : d.preview}</span>
                  <span class="dup-count">×{d.count}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Message Count Distribution -->
      <div class="card card-wide">
        <div class="card-header">
          <span class="card-label">Message Count Distribution</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        {#if s.messageCounts.buckets}
          {@const mx = maxBucket(s.messageCounts.buckets)}
          <div class="bar-chart" role="img" aria-label="Message count distribution bar chart">
            {#each BUCKET_KEYS as key}
              {@const val = s.messageCounts.buckets[key] ?? 0}
              <div class="bar-row">
                <span class="bar-label">{bucketLabel(key)}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: {mx > 0 ? (val / mx) * 100 : 0}%"></div>
                </div>
                <span class="bar-value">{val}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="card-detail"><span class="dim">no messages[] field found</span></div>
        {/if}
      </div>

      <!-- Role Frequency -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Role Frequency</span>
          <span class="dot dot-{roleStatus(s)}" aria-label="Status: {roleStatus(s)}"></span>
        </div>
        {#if s.roles.total > 0}
          <div class="card-big">{Object.keys(s.roles.counts).length}<span class="big-suffix">roles</span></div>
          <div class="card-detail">
            {#each Object.entries(s.roles.counts).sort((a, b) => b[1] - a[1]) as [role, count]}
              <div class="role-row">
                <span class="role-name">{role}</span>
                <span class="role-pct">{pct(count, s.roles.total)}</span>
                <span class="role-count dim">({count})</span>
              </div>
            {/each}
            {#if !s.roles.hasSystem}
              <span class="flag-warn">no system turns</span>
            {/if}
          </div>
        {:else}
          <div class="card-detail"><span class="dim">no messages[] field</span></div>
        {/if}
      </div>

      <!-- Content Stats -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Content</span>
          <span class="dot dot-{contentStatus(s)}" aria-label="Status: {contentStatus(s)}"></span>
        </div>
        <div class="card-big">{s.content.avgChars.toLocaleString()}<span class="big-suffix">avg chars</span></div>
        <div class="card-detail">
          {#if s.content.emptyContentCount > 0}
            <span class="flag-warn">{s.content.emptyContentCount} empty content</span>
          {:else}
            <span class="ok-text">no empty content</span>
          {/if}
          <span>{s.content.veryShort} very short (&lt;10 ch)</span>
          <span>{s.content.veryLong} very long (&gt;4k ch)</span>
        </div>
      </div>

      <!-- Language Hint -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Language (approx)</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        <div class="card-big lang-label">{langLabel(s.languageHint)}</div>
        <div class="card-detail">
          <span class="dim">sampled 50 records · heuristic only</span>
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

  .card-wide {
    grid-column: span 2;
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

  .lang-label {
    font-size: 16px;
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

  .jump-btn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    padding: 1px 6px;
    color: var(--accent);
    align-self: flex-start;
    line-height: 1.4;
  }

  .jump-btn:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  /* Bar chart */
  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .bar-label {
    width: 50px;
    color: var(--ink-dim);
    font-size: 11px;
    flex-shrink: 0;
    text-align: right;
  }

  .bar-track {
    flex: 1;
    height: 10px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.2s;
  }

  .bar-value {
    width: 36px;
    text-align: right;
    color: var(--ink-dim);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  /* Role rows */
  .role-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .role-name {
    min-width: 72px;
    color: var(--ink);
    font-size: 12px;
  }

  .role-pct {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }

  .role-count {
    font-size: 11px;
  }

  /* Duplicate samples */
  .dup-samples {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
  }

  .dup-sample {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }

  .dup-preview {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-family: inherit;
  }

  .dup-count {
    color: var(--err);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  /* Responsive: 2-col on medium, 1-col on mobile */
  @media (max-width: 960px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .card-wide {
      grid-column: span 2;
    }
  }

  @media (max-width: 600px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
    .card-wide {
      grid-column: span 1;
    }
  }
</style>
