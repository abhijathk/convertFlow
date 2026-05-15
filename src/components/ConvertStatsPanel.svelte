<script lang="ts">
  import { convertState } from '../stores/convertState';
  import { openFile, pendingJump } from '../stores/editorState';
  import { setTab } from '../stores/shellState';
  import { computeDatasetStats, type DatasetStats } from '../lib/dataset-stats';
  import { generateDatasetSummary, type DatasetSummary } from '../lib/dataset-summary';
  import presetsJson from '../data/presets.json';

  type Preset = typeof presetsJson[number];

  let stats = $state<DatasetStats | null>(null);
  let summary = $state<DatasetSummary | null>(null);
  let activePreset = $state<Preset | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function getPreset(id: string): Preset {
    return presetsJson.find(p => p.id === id) ?? presetsJson[0];
  }

  $effect(() => {
    const content = $convertState.editorContent;
    const presetId = $convertState.presetId;
    const validationErrors = $convertState.errors;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!content.trim()) { stats = null; summary = null; activePreset = null; return; }
    debounceTimer = setTimeout(() => {
      const preset = getPreset(presetId);
      activePreset = preset;
      stats = computeDatasetStats(content, preset);
      summary = generateDatasetSummary(stats, preset, validationErrors);
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
    const userCount = s.roles.counts['user'] ?? 0;
    const assistantCount = s.roles.counts['assistant'] ?? 0;
    // Red: dataset is clearly broken — no system turns at all, OR assistant
    // count is more than 3× user count (model has way more to say than the
    // human prompts it).
    if (!s.roles.hasSystem) return 'err';
    if (userCount > 0 && assistantCount > userCount * 3) return 'err';
    // Amber: any role takes more than 70% of all turns, or any role drops
    // below 5% — distribution is skewed enough to flag.
    for (const count of Object.values(s.roles.counts)) {
      const pct = count / s.roles.total;
      if (pct > 0.70 || pct < 0.05) return 'warn';
    }
    // Amber: mild assistant-heavy imbalance (1.5×-3× user).
    if (userCount > 0 && assistantCount > userCount * 1.5) return 'warn';
    return 'ok';
  }

  function roleStatusReason(s: DatasetStats): string {
    if (s.roles.total === 0) return '';
    const userCount = s.roles.counts['user'] ?? 0;
    const assistantCount = s.roles.counts['assistant'] ?? 0;
    if (!s.roles.hasSystem) return 'no system turns';
    if (userCount > 0 && assistantCount > userCount * 3) return `assistant ${(assistantCount / userCount).toFixed(1)}× user`;
    for (const [role, count] of Object.entries(s.roles.counts)) {
      const pct = count / s.roles.total;
      if (pct > 0.70) return `${role} ${(pct * 100).toFixed(0)}% (skewed)`;
      if (pct < 0.05) return `${role} only ${(pct * 100).toFixed(1)}%`;
    }
    if (userCount > 0 && assistantCount > userCount * 1.5) return `assistant ${(assistantCount / userCount).toFixed(1)}× user`;
    return 'balanced';
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

  // ---------------------------------------------------------------------------
  // New helper functions
  // ---------------------------------------------------------------------------

  function refusalStatus(s: DatasetStats): Status {
    if (s.refusal.pctOfAssistant > 0.20) return 'err';
    if (s.refusal.pctOfAssistant > 0.05) return 'warn';
    return 'ok';
  }

  function assistantLengthStatus(s: DatasetStats): Status {
    if (s.assistantLength.count === 0) return 'ok';
    if (s.assistantLength.median < 20) return 'warn';
    if (s.assistantLength.median > 3000) return 'warn';
    return 'ok';
  }

  function systemPromptStatus(s: DatasetStats): Status {
    if (s.systemPrompt.totalWithSystem === 0) return 'ok';
    if (s.systemPrompt.dominantPct > 0.95 && s.recordCount > 5) return 'warn';
    return 'ok';
  }

  function qualityFlagsStatus(s: DatasetStats): Status {
    const total = s.qualityFlags.controlChars + s.qualityFlags.promptInjection;
    if (total > 0) return 'warn';
    if (s.qualityFlags.htmlEscapes > 5) return 'warn';
    return 'ok';
  }

  function costEstimate(
    s: DatasetStats,
    preset: Preset | null,
  ): { cost: number; perMTokens: number } | null {
    const perM = preset?.pricing?.trainingPerMTokens;
    if (!perM || !s.tokenLengths || s.recordCount === 0) return null;
    const totalTokens = s.tokenLengths.mean * s.recordCount;
    return { cost: (totalTokens / 1_000_000) * perM, perMTokens: perM };
  }

  // ── Export report ────────────────────────────────────────────────────────────

  let exportFormat = $state<'md' | 'csv'>('md');

  function buildMarkdownReport(s: DatasetStats, sum: DatasetSummary, preset: Preset | null): string {
    const now = new Date().toISOString();
    const totalChars = s.tokenLengths.mean * s.recordCount * 4; // rough char estimate
    const bulletPrefix = (b: DatasetSummary['bullets'][number]): string => {
      if (b.status === 'ok')   return '✓ OK';
      if (b.status === 'warn') return '⚠ Warn';
      return '✗ Err';
    };

    const findingsSection = sum.bullets.map(b => `- [${bulletPrefix(b)}] ${b.text}`).join('\n');

    const ce = costEstimate(s, preset);
    const rows: [string, string][] = [
      ['Total records',            String(s.recordCount)],
      ['Invalid records',          String(s.invalidCount)],
      ['Empty records',            String(s.emptyCount)],
      ['Duplicate (exact)',        String(s.duplicates.exact)],
      ['Near-duplicate (norm)',    String(s.duplicates.normalized)],
      ['Over-budget records',      String(s.overBudget.count)],
      ['Token budget limit',       String(s.overBudget.limit)],
      ['Mean tokens/record',       String(s.tokenLengths.mean)],
      ['Median tokens/record',     String(s.tokenLengths.median)],
      ['P95 tokens/record',        String(s.tokenLengths.p95)],
      ['Max tokens/record',        String(s.tokenLengths.max)],
      ['Mean assistant chars',     String(s.assistantLength.mean)],
      ['Median assistant chars',   String(s.assistantLength.median)],
      ['Refusal count',            String(s.refusal.count)],
      ['Refusal % (of asst)',      (s.refusal.pctOfAssistant * 100).toFixed(1) + '%'],
      ['Control char records',     String(s.qualityFlags.controlChars)],
      ['HTML escape records',      String(s.qualityFlags.htmlEscapes)],
      ['Prompt injection records', String(s.qualityFlags.promptInjection)],
      ['Unique vocab tokens',      String(s.vocabRichness.uniqueTokens)],
      ['Type-token ratio',         (s.vocabRichness.typeTokenRatio * 100).toFixed(1) + '%'],
      ['Est. training time (min)', String(s.trainingTimeEstimate.minutes)],
      ...(ce ? [['Est. training cost ($)', `$${ce.cost.toFixed(2)}`] as [string, string]] : []),
    ];

    const statsTable = [
      '| Metric | Value |',
      '|---|---|',
      ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    ].join('\n');

    return [
      '# convertFlow validation report',
      `Generated: ${now}`,
      `Preset: ${preset?.name ?? 'unknown'}`,
      `Dataset: ${s.recordCount} records, ~${totalChars.toLocaleString()} chars`,
      '',
      '## Summary',
      sum.tldr,
      '',
      '## Findings',
      findingsSection || '- [✓ OK] No issues detected.',
      '',
      '## Stats',
      statsTable,
    ].join('\n');
  }

  function buildCsvReport(s: DatasetStats, preset: Preset | null): string {
    const ce = costEstimate(s, preset);
    const rows: [string, string][] = [
      ['preset',                   preset?.name ?? ''],
      ['total_records',            String(s.recordCount)],
      ['invalid_records',          String(s.invalidCount)],
      ['empty_records',            String(s.emptyCount)],
      ['duplicate_exact',          String(s.duplicates.exact)],
      ['duplicate_normalized',     String(s.duplicates.normalized)],
      ['over_budget',              String(s.overBudget.count)],
      ['token_budget_limit',       String(s.overBudget.limit)],
      ['token_mean',               String(s.tokenLengths.mean)],
      ['token_median',             String(s.tokenLengths.median)],
      ['token_p95',                String(s.tokenLengths.p95)],
      ['token_max',                String(s.tokenLengths.max)],
      ['asst_chars_mean',          String(s.assistantLength.mean)],
      ['asst_chars_median',        String(s.assistantLength.median)],
      ['refusal_count',            String(s.refusal.count)],
      ['refusal_pct_of_asst',      (s.refusal.pctOfAssistant * 100).toFixed(1)],
      ['control_chars',            String(s.qualityFlags.controlChars)],
      ['html_escapes',             String(s.qualityFlags.htmlEscapes)],
      ['prompt_injection',         String(s.qualityFlags.promptInjection)],
      ['vocab_unique_tokens',      String(s.vocabRichness.uniqueTokens)],
      ['type_token_ratio',         (s.vocabRichness.typeTokenRatio * 100).toFixed(1)],
      ['est_training_minutes',     String(s.trainingTimeEstimate.minutes)],
      ...(ce ? [['est_training_cost_usd', ce.cost.toFixed(2)] as [string, string]] : []),
    ];
    const header = rows.map(([k]) => k).join(',');
    const values = rows.map(([, v]) => `"${v.replace(/"/g, '""')}"`).join(',');
    return `${header}\n${values}`;
  }

  function downloadReport() {
    if (!stats || !summary) return;
    const ts = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 15);
    const isCsv = exportFormat === 'csv';
    const content = isCsv
      ? buildCsvReport(stats, activePreset)
      : buildMarkdownReport(stats, summary, activePreset);
    const mime = isCsv ? 'text/csv' : 'text/markdown';
    const ext  = isCsv ? 'csv' : 'md';
    const filename = `convertflow-report-${ts}.${ext}`;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="stats-panel" role="region" aria-label="Dataset statistics">
  {#if stats}
    <div class="export-toolbar">
      <select
        class="export-format-select"
        bind:value={exportFormat}
        aria-label="Report format"
        title="Report format"
      >
        <option value="md">Markdown</option>
        <option value="csv">CSV</option>
      </select>
      <button
        class="export-report-btn"
        onclick={downloadReport}
        title="Download validation report"
        aria-label="Export validation report"
      >export report ↓</button>
    </div>
  {/if}
  {#if !stats}
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">◌</span>
      <span>No data — paste JSONL content into the editor.</span>
    </div>
  {:else}
    {@const s = stats}
    {#if summary}
      <div class="summary-card summary-{summary.status}" role="region" aria-label="Dataset summary">
        <div class="summary-header">
          <span class="summary-icon" aria-hidden="true">
            {#if summary.status === 'err'}
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2L1.5 13h13L8 2Z"/><line x1="8" y1="6" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.6" fill="currentColor" stroke="none"/></svg>
            {:else if summary.status === 'warn'}
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/></svg>
            {:else}
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3,8.5 7,12 13,5"/></svg>
            {/if}
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
            {#if roleStatusReason(s)}
              <span class="flag-{roleStatus(s)}">{roleStatusReason(s)}</span>
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

      <!-- Cost Estimate (active preset) -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Training Cost</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        {#if costEstimate(s, activePreset)}
          {@const ce = costEstimate(s, activePreset)}
          {#if ce}
            <div class="card-big">${ce.cost.toFixed(2)}<span class="big-suffix">est.</span></div>
            <div class="card-detail">
              <span>≈ {(s.tokenLengths.mean * s.recordCount).toLocaleString()} total tokens</span>
              <span class="dim">@ ${ce.perMTokens}/M training tokens</span>
            </div>
          {/if}
        {:else}
          <div class="card-detail"><span class="dim">preset pricing not set</span></div>
        {/if}
      </div>

      <!-- Assistant Length -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Assistant Length</span>
          <span class="dot dot-{assistantLengthStatus(s)}" aria-label="Status: {assistantLengthStatus(s)}"></span>
        </div>
        {#if s.assistantLength.count > 0}
          <div class="card-big">{s.assistantLength.median.toLocaleString()}<span class="big-suffix">chars p50</span></div>
          <div class="card-detail">
            <span>min {s.assistantLength.min} · p95 {s.assistantLength.p95} · max {s.assistantLength.max}</span>
            <span class="dim">across {s.assistantLength.count} assistant messages</span>
          </div>
        {:else}
          <div class="card-detail"><span class="dim">no assistant turns</span></div>
        {/if}
      </div>

      <!-- System Prompt Diversity -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">System Prompts</span>
          <span class="dot dot-{systemPromptStatus(s)}" aria-label="Status: {systemPromptStatus(s)}"></span>
        </div>
        {#if s.systemPrompt.totalWithSystem > 0}
          <div class="card-big">{s.systemPrompt.uniqueCount}<span class="big-suffix">unique</span></div>
          <div class="card-detail">
            {#if s.systemPrompt.dominantText}
              <span title={s.systemPrompt.dominantText}>most: {Math.round(s.systemPrompt.dominantPct * 100)}% "{s.systemPrompt.dominantText.length > 60 ? s.systemPrompt.dominantText.slice(0, 60) + '…' : s.systemPrompt.dominantText}"</span>
            {/if}
            {#if s.systemPrompt.dominantPct > 0.95 && s.recordCount > 5}
              <span class="flag-warn">single shared prompt — intentional?</span>
            {/if}
          </div>
        {:else}
          <div class="card-detail"><span class="dim">no system turns</span></div>
        {/if}
      </div>

      <!-- Refusal Phrases -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Refusals</span>
          <span class="dot dot-{refusalStatus(s)}" aria-label="Status: {refusalStatus(s)}"></span>
        </div>
        <div class="card-big">{s.refusal.count}<span class="big-suffix">flagged</span></div>
        <div class="card-detail">
          {#if s.refusal.count === 0}
            <span class="ok-text">no refusal phrases</span>
          {:else}
            <span class={refusalStatus(s) === 'err' ? 'flag-err' : 'flag-warn'}>
              {(s.refusal.pctOfAssistant * 100).toFixed(1)}% of assistant turns
            </span>
            <span class="dim">e.g. "I cannot help", "I'm sorry but", "As an AI…"</span>
          {/if}
        </div>
      </div>

      <!-- Quality Flags (combined row) -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Quality Flags</span>
          <span class="dot dot-{qualityFlagsStatus(s)}" aria-label="Status: {qualityFlagsStatus(s)}"></span>
        </div>
        <div class="card-detail">
          {#if s.qualityFlags.controlChars + s.qualityFlags.htmlEscapes + s.qualityFlags.promptInjection === 0}
            <span class="ok-text">no quality issues detected</span>
          {:else}
            {#if s.qualityFlags.controlChars > 0}
              <span class="flag-err">{s.qualityFlags.controlChars} record{s.qualityFlags.controlChars === 1 ? '' : 's'} with control chars</span>
            {/if}
            {#if s.qualityFlags.htmlEscapes > 0}
              <span class="flag-warn">{s.qualityFlags.htmlEscapes} with HTML escapes (e.g. &amp;amp;)</span>
            {/if}
            {#if s.qualityFlags.promptInjection > 0}
              <span class="flag-err">{s.qualityFlags.promptInjection} prompt-injection pattern{s.qualityFlags.promptInjection === 1 ? '' : 's'}</span>
            {/if}
          {/if}
        </div>
      </div>

      <!-- Sentiment (assistant only, lexicon estimate) -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Tone (est.)</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        {#if s.assistantLength.count > 0}
          <div class="card-big">{Math.round((s.sentiment.positive / Math.max(1, s.sentiment.positive + s.sentiment.neutral + s.sentiment.negative)) * 100)}<span class="big-suffix">% positive</span></div>
          <div class="card-detail">
            <span>+ {s.sentiment.positive} · ◦ {s.sentiment.neutral} · − {s.sentiment.negative}</span>
            <span class="dim">crude lexicon estimate — assistant only</span>
          </div>
        {:else}
          <div class="card-detail"><span class="dim">no assistant turns</span></div>
        {/if}
      </div>

      <!-- Top n-grams -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Top Words (assistant)</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        {#if s.topNgrams.unigrams.length > 0}
          <div class="card-detail">
            <div>
              {#each s.topNgrams.unigrams.slice(0, 6) as u, i}
                <span class="role-pct">{u.word}</span><span class="role-count dim">({u.count}){i < 5 && i < s.topNgrams.unigrams.length - 1 ? ' · ' : ''}</span>
              {/each}
            </div>
            {#if s.topNgrams.bigrams.length > 0}
              <span class="dim">top bigrams: {s.topNgrams.bigrams.slice(0, 3).map(b => `"${b.phrase}" (${b.count})`).join(' · ')}</span>
            {/if}
          </div>
        {:else}
          <div class="card-detail"><span class="dim">no assistant content</span></div>
        {/if}
      </div>

      <!-- Training Time Estimate -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Training Time (est.)</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        <div class="card-big">{s.trainingTimeEstimate.minutes}<span class="big-suffix">min</span></div>
        <div class="card-detail">
          <span class="dim">{s.trainingTimeEstimate.basis}</span>
          <span class="dim">heavily provider-dependent — for ballpark only</span>
        </div>
      </div>

      <!-- Vocabulary Richness -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Vocabulary</span>
          <span class="dot dot-ok" aria-label="Status: ok"></span>
        </div>
        <div class="card-big">{(s.vocabRichness.typeTokenRatio * 100).toFixed(1)}<span class="big-suffix">% unique</span></div>
        <div class="card-detail">
          <span>{s.vocabRichness.uniqueTokens.toLocaleString()} unique / {s.vocabRichness.totalTokens.toLocaleString()} total</span>
          <span class="dim">higher = more topic breadth, lower = repetitive</span>
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

  .export-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-bottom: 12px;
  }

  .export-format-select {
    appearance: none;
    -webkit-appearance: none;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink-dim);
    font-family: inherit;
    font-size: 11px;
    padding: 2px 20px 2px 6px;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='%23a8a296' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    outline: none;
  }
  .export-format-select:hover { border-color: var(--ink-dim); }
  .export-format-select option { background: var(--surface); color: var(--ink); }

  .export-report-btn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
    white-space: nowrap;
  }
  .export-report-btn:hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: var(--accent);
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
  .flag-ok   { color: var(--ok); }
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
    align-items: center;
    gap: 10px;
  }
  .summary-icon {
    display: inline-flex;
    align-items: center;
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
    content: '!';
    color: var(--err);
    font-size: 11px;
    font-weight: 700;
    top: 5px;
  }
  .bullet-warn {
    color: var(--warn);
    background: color-mix(in srgb, var(--warn) 8%, transparent);
  }
  .bullet-warn::before {
    content: '?';
    color: var(--warn);
    font-size: 11px;
    font-weight: 700;
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
