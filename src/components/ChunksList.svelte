<script lang="ts">
  import { chunkState } from '../stores/chunkState';
  import ChunkLoader from './ChunkLoader.svelte';

  type ChunkExportFormat = 'jsonl' | 'json' | 'csv';

  interface Props {
    selectedIndex: number | undefined;
    onselect: (i: number) => void;
    exportFormat: ChunkExportFormat;
  }
  const { selectedIndex, onselect, exportFormat }: Props = $props();

  let chunks = $derived($chunkState.chunks);
  let parseStatus = $derived($chunkState.parseStatus);
  let parseError = $derived($chunkState.parseError);
  let parseProgress = $derived($chunkState.parseProgress);
  let sourceCharCount = $derived($chunkState.sourceCharCount);
  let copyFeedback = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  function densityGlyph(score: number): string {
    const idx = Math.min(4, Math.floor(score * 5));
    return '▁▂▃▄▅'.charAt(idx);
  }

  function csvEsc(v: string): string {
    return '"' + String(v).replace(/"/g, '""') + '"';
  }

  function buildOutput(): string {
    // Only spread userMeta fields that have a non-empty value
    const rawMeta = $chunkState.userMeta;
    const meta = Object.fromEntries(
      Object.entries(rawMeta).filter(([, v]) => String(v).trim() !== '')
    );
    const enriched = chunks.map(c => ({ ...c, ...meta }));

    if (exportFormat === 'jsonl') {
      // One JSON object per line, trailing newline (standard UNIX text file)
      return enriched.map(c => JSON.stringify(c)).join('\n') + '\n';
    }
    if (exportFormat === 'json') {
      // Single JSON array — must be parsed as a whole
      return JSON.stringify(enriched, null, 2) + '\n';
    }
    // csv: flatten columns; arrays joined with `|`
    const metaKeys = Object.keys(meta);
    const baseCols = ['chunk_id', 'chunk_index', 'total_siblings', 'approx_tokens', 'char_count', 'word_count', 'density_score', 'keywords', 'hash', 'content'];
    const cols = metaKeys.length ? [...baseCols, ...metaKeys] : baseCols;
    const rows = [cols.join(',')];
    for (const c of enriched) {
      rows.push(cols.map(k => {
        const v = (c as Record<string, unknown>)[k];
        if (Array.isArray(v)) return csvEsc(v.join('|'));
        if (typeof v === 'number') return String(v);
        return csvEsc(String(v ?? ''));
      }).join(','));
    }
    return rows.join('\n') + '\n';
  }

  function fileName(): string {
    return `chunks.${exportFormat}`;
  }

  function mimeType(): string {
    if (exportFormat === 'json') return 'application/json';
    if (exportFormat === 'csv') return 'text/csv';
    return 'application/jsonlines';
  }

  function copyOutput() {
    const text = buildOutput();
    navigator.clipboard.writeText(text).then(() => {
      if (copyTimer) clearTimeout(copyTimer);
      copyFeedback = 'copied';
      copyTimer = setTimeout(() => (copyFeedback = ''), 2000);
    });
  }

  function downloadOutput() {
    const text = buildOutput();
    const blob = new Blob([text], { type: mimeType() });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="chunks-list" role="list" aria-label="Chunked document segments">
  {#if parseStatus === 'idle' && chunks.length === 0}
    <div class="empty" role="status">
      <div class="drop-zone">
        <span class="hint">upload a document to see chunks</span>
      </div>
    </div>

  {:else if parseStatus === 'uploading' || parseStatus === 'parsing'}
    <ChunkLoader status={parseStatus} progress={parseProgress} {sourceCharCount} />

  {:else if parseStatus === 'error'}
    <div class="parse-error" role="alert">
      <span class="glyph" aria-label="Error">×</span>
      <span>{parseError ?? 'Parse failed'}</span>
    </div>

  {:else}
    <div class="export-bar">
      <span class="export-label">
        {chunks.length} chunks
        {#if exportFormat === 'jsonl'}
          <span class="fmt-note" title="One JSON object per line — streamable, appendable">· {chunks.length} lines</span>
        {:else if exportFormat === 'json'}
          <span class="fmt-note" title="Single JSON array — must be parsed as a whole">· 1 array</span>
        {:else}
          <span class="fmt-note">· {chunks.length + 1} rows</span>
        {/if}
      </span>
      <div class="export-actions">
        <button onclick={copyOutput}>
          {copyFeedback ? '✓ copied' : 'copy'}
        </button>
        <button onclick={downloadOutput}>download ↑</button>
      </div>
    </div>

    {#each chunks as chunk, i}
      <div
        class="chunk-row"
        class:selected={selectedIndex === i}
        role="button"
        tabindex="0"
        aria-label="Chunk {i + 1} of {chunks.length}"
        aria-selected={selectedIndex === i}
        onclick={() => onselect(i)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselect(i); } }}
      >
        <div class="chunk-header">
          <span class="chunk-id">{chunk.chunk_id}</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="tokens tabular">{chunk.approx_tokens}t</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="density" title="Density: {chunk.density_score.toFixed(2)}" aria-label="Density {densityGlyph(chunk.density_score)}">
            {densityGlyph(chunk.density_score)}
          </span>
        </div>
        {#if chunk.keywords.length > 0}
          <div class="keywords" aria-label="Keywords">
            {#each chunk.keywords.slice(0, 4) as kw}
              <span class="keyword-pill">{kw}</span>
            {/each}
          </div>
        {/if}
        <div class="chunk-preview">
          {chunk.content.slice(0, 140)}{chunk.content.length > 140 ? '…' : ''}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .chunks-list {
    flex: 1;
    overflow-y: auto;
    background: var(--bg);
    border-left: 1px solid var(--border);
    min-width: 0;
  }

  .export-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }

  .export-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 1;
  }

  .fmt-note {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }

  .export-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .export-actions button {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
  }

  .export-actions button:hover { background: var(--border); }

  .format-select {
    appearance: none;
    -webkit-appearance: none;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 1px 18px 1px 6px;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='%23a8a296' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 5px center;
  }
  .format-select:hover { border-color: var(--ink-dim); }
  .format-select option { background: var(--surface); color: var(--ink); }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 16px;
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px;
    border: 2px dashed var(--border);
    border-radius: 4px;
    width: 100%;
    text-align: center;
  }

  .hint { font-size: 13px; color: var(--ink-dim); }
  .sub { font-size: 12px; color: var(--muted); }

  .parse-error {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--err);
    border-radius: 3px;
    font-size: 13px;
    color: var(--ink);
  }

  .glyph { color: var(--err); flex-shrink: 0; }

  .chunk-row {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    font-size: 13px;
    transition: background 0.1s;
  }

  .chunk-row:hover { background: var(--surface); }

  .chunk-row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .chunk-row.selected {
    background: var(--surface);
    padding-left: 14px;
  }

  .chunk-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }

  .chunk-id { font-size: 12px; color: var(--ink-dim); }
  .sep { color: var(--muted); }
  .tokens { font-size: 12px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .density { color: var(--accent); font-size: 13px; }

  .keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-bottom: 5px;
  }

  .keyword-pill {
    padding: 1px 5px;
    background: var(--border);
    border-radius: 2px;
    font-size: 11px;
    color: var(--ink-dim);
  }

  .chunk-preview {
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
</style>
