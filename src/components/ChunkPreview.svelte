<script lang="ts">
  import type { ChunkMeta } from '../stores/chunkState';

  type ChunkExportFormat = 'jsonl' | 'json' | 'csv';

  interface Props {
    chunk: ChunkMeta | undefined;
    prevChunk: ChunkMeta | undefined;
    nextChunk: ChunkMeta | undefined;
    selectedIndex: number | undefined;
    total: number;
    exportFormat: ChunkExportFormat;
    onprev: () => void;
    onnext: () => void;
  }
  const { chunk, prevChunk, nextChunk, selectedIndex, total, exportFormat, onprev, onnext }: Props = $props();

  const OVERLAP_STORAGE_KEY = 'dataprep:chunk-show-overlap';

  function readOverlapPref(): boolean {
    try {
      const v = localStorage.getItem(OVERLAP_STORAGE_KEY);
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  }

  let showOverlap = $state(readOverlapPref());

  function toggleOverlap() {
    showOverlap = !showOverlap;
    try { localStorage.setItem(OVERLAP_STORAGE_KEY, String(showOverlap)); } catch {}
  }

  interface OverlapSegment {
    text: string;
    kind: 'plain' | 'prev' | 'next' | 'both';
  }

  function buildOverlapSegments(c: ChunkMeta, prev: ChunkMeta | undefined, next: ChunkMeta | undefined): OverlapSegment[] {
    const text = c.content;
    const len = text.length;

    // Overlap-prev: characters in [c.start, min(c.end, prev.end)] relative to c.start
    const prevOverlapEnd = prev ? Math.min(len, prev.endOffset - c.startOffset) : 0;
    const prevOverlapStart = 0;
    const hasPrev = prev !== undefined && prevOverlapEnd > prevOverlapStart;

    // Overlap-next: characters in [max(c.start, next.start), c.end] relative to c.start
    const nextOverlapStart = next ? Math.max(0, next.startOffset - c.startOffset) : len;
    const nextOverlapEnd = len;
    const hasNext = next !== undefined && nextOverlapStart < nextOverlapEnd;

    if (!hasPrev && !hasNext) {
      return [{ text, kind: 'plain' }];
    }

    // Build sorted event list and walk segments
    type Event = { pos: number; tag: 'prevStart' | 'prevEnd' | 'nextStart' | 'nextEnd' };
    const events: Event[] = [];
    if (hasPrev) {
      events.push({ pos: prevOverlapStart, tag: 'prevStart' });
      events.push({ pos: prevOverlapEnd, tag: 'prevEnd' });
    }
    if (hasNext) {
      events.push({ pos: nextOverlapStart, tag: 'nextStart' });
      events.push({ pos: nextOverlapEnd, tag: 'nextEnd' });
    }
    events.sort((a, b) => a.pos - b.pos || a.tag.localeCompare(b.tag));

    const segments: OverlapSegment[] = [];
    let cursor = 0;
    let inPrev = false;
    let inNext = false;

    function flush(end: number) {
      if (end <= cursor) return;
      const slice = text.slice(cursor, end);
      const kind: OverlapSegment['kind'] =
        inPrev && inNext ? 'both' : inPrev ? 'prev' : inNext ? 'next' : 'plain';
      segments.push({ text: slice, kind });
      cursor = end;
    }

    for (const ev of events) {
      flush(ev.pos);
      if (ev.tag === 'prevStart') inPrev = true;
      else if (ev.tag === 'prevEnd') inPrev = false;
      else if (ev.tag === 'nextStart') inNext = true;
      else if (ev.tag === 'nextEnd') inNext = false;
    }
    flush(len);
    return segments;
  }

  let overlapSegments = $derived(
    chunk && showOverlap
      ? buildOverlapSegments(chunk, prevChunk, nextChunk)
      : chunk
        ? [{ text: chunk.content, kind: 'plain' as const }]
        : []
  );

  let hasAnyOverlap = $derived(
    chunk !== undefined && (prevChunk !== undefined || nextChunk !== undefined)
  );

  function densityGlyph(score: number): string {
    const idx = Math.min(4, Math.floor(score * 5));
    return '▁▂▃▄▅'.charAt(idx);
  }

  function csvEsc(v: string): string {
    return '"' + String(v).replace(/"/g, '""') + '"';
  }

  function renderChunk(c: ChunkMeta, fmt: ChunkExportFormat): string {
    if (fmt === 'jsonl') {
      // One self-contained line — exactly what appears in the .jsonl file
      return JSON.stringify(c);
    }
    if (fmt === 'json') {
      // The exported file is a JSON array; show this chunk as one element inside it
      const inner = JSON.stringify(c, null, 2)
        .split('\n')
        .map(l => '  ' + l)
        .join('\n');
      return '[\n' + inner + '\n]';
    }
    // csv — columns match ChunkMeta exactly (no userMeta in single-chunk preview)
    const cols = ['chunk_id','chunk_index','total_siblings','approx_tokens','char_count','word_count','density_score','keywords','hash','content'];
    const header = cols.join(',');
    const row = cols.map(k => {
      const v = (c as Record<string, unknown>)[k];
      if (Array.isArray(v)) return csvEsc(v.join('|'));
      if (typeof v === 'number') return String(v);
      return csvEsc(String(v ?? ''));
    }).join(',');
    return header + '\n' + row;
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function highlightJson(text: string): string {
    const out: string[] = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        let j = i + 1;
        while (j < text.length) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text[j] === '"') { j++; break; }
          j++;
        }
        const str = text.slice(i, j);
        let k = j;
        while (k < text.length && (text[k] === ' ' || text[k] === '\t')) k++;
        if (text[k] === ':') {
          out.push(`<span class="t-key">${esc(str)}</span>`);
        } else {
          out.push(`<span class="t-str">${esc(str)}</span>`);
        }
        i = j;
      } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
        let j = i;
        if (text[j] === '-') j++;
        while (j < text.length && /[\d.eE+\-]/.test(text[j])) j++;
        out.push(`<span class="t-num">${esc(text.slice(i, j))}</span>`);
        i = j;
      } else if (text.slice(i, i + 4) === 'true' || text.slice(i, i + 4) === 'null') {
        out.push(`<span class="t-bool">${esc(text.slice(i, i + 4))}</span>`);
        i += 4;
      } else if (text.slice(i, i + 5) === 'false') {
        out.push(`<span class="t-bool">${esc(text.slice(i, i + 5))}</span>`);
        i += 5;
      } else if ('{}[]:,'.includes(ch)) {
        out.push(`<span class="t-punct">${esc(ch)}</span>`);
        i++;
      } else if (ch === '\n') {
        out.push('\n');
        i++;
      } else {
        out.push(esc(ch));
        i++;
      }
    }
    return out.join('');
  }

  function highlightCsv(text: string): string {
    const lines = text.split('\n');
    return lines.map((line, li) => {
      if (li === 0) {
        // header row: each column name as a key
        return line.split(',')
          .map(col => `<span class="t-key">${esc(col)}</span>`)
          .join('<span class="t-punct">,</span>');
      }
      // data row: quoted strings amber, bare numbers purple
      return line.replace(/("(?:[^"\\]|\\.)*"|[^,]+|(?=,)|(?<=,)(?=,|$))/g, (tok) => {
        if (tok.startsWith('"')) return `<span class="t-str">${esc(tok)}</span>`;
        if (/^-?\d/.test(tok)) return `<span class="t-num">${esc(tok)}</span>`;
        return esc(tok);
      }).replace(/,/g, '<span class="t-punct">,</span>');
    }).join('\n');
  }

  function buildHighlighted(c: ChunkMeta, fmt: ChunkExportFormat): string {
    const raw = renderChunk(c, fmt);
    if (fmt === 'csv') return highlightCsv(raw);
    return highlightJson(raw);
  }

  function promptLine(c: ChunkMeta, fmt: ChunkExportFormat): string {
    if (fmt === 'jsonl') return `chunks.jsonl  — line ${c.chunk_index + 1}`;
    if (fmt === 'json')  return `chunks.json  — array[${c.chunk_index}]`;
    return `chunks.csv  — row ${c.chunk_index + 2}`; // +2: 1-indexed + header row
  }

  // Split highlighted output into lines for line-number gutter
  function toLines(html: string): string[] {
    return html.split('\n');
  }

  let highlighted = $derived(chunk ? buildHighlighted(chunk, exportFormat) : '');
  let lines = $derived(toLines(highlighted));
</script>

<div class="chunk-preview-panel">
  {#if chunk === undefined}
    <div class="empty">
      <span class="empty-hint">select a chunk to preview</span>
    </div>
  {:else}
    <div class="preview-toolbar">
      <span class="chunk-id">{chunk.chunk_id}</span>
      <div class="nav-actions">
        <span class="fmt-badge">{exportFormat}</span>
        <button class="nav-btn" onclick={onprev} disabled={selectedIndex === 0} title="Previous chunk">‹</button>
        <span class="nav-pos">{(selectedIndex ?? 0) + 1} / {total}</span>
        <button class="nav-btn" onclick={onnext} disabled={selectedIndex === total - 1} title="Next chunk">›</button>
      </div>
    </div>

    <div class="stats-bar">
      <span class="stat"><span class="stat-val">{chunk.approx_tokens}</span> tokens</span>
      <span class="sep" aria-hidden="true">·</span>
      <span class="stat"><span class="stat-val">{chunk.char_count}</span> chars</span>
      <span class="sep" aria-hidden="true">·</span>
      <span class="stat"><span class="stat-val">{chunk.word_count}</span> words</span>
      <span class="sep" aria-hidden="true">·</span>
      <span class="stat" title="Density score: {chunk.density_score.toFixed(2)} — unique/meaningful term richness. ▁=sparse (repetitive) ▅=dense (information-rich)">density <span class="stat-val">{densityGlyph(chunk.density_score)}</span></span>
      {#if hasAnyOverlap}
        <span class="sep" aria-hidden="true">·</span>
        <button class="overlap-toggle" onclick={toggleOverlap} title={showOverlap ? 'Hide overlap highlights' : 'Show overlap highlights'}>
          overlap {showOverlap ? 'on' : 'off'}
        </button>
      {/if}
    </div>

    {#if hasAnyOverlap && showOverlap}
      <div class="overlap-view" aria-label="Chunk text with overlap highlights">
        <div class="overlap-text">{#each overlapSegments as seg}<span
          class="seg-{seg.kind}"
          style={seg.kind === 'prev' ? 'background:rgba(59,130,246,0.18);' : seg.kind === 'next' ? 'background:rgba(249,115,22,0.18);' : seg.kind === 'both' ? 'background:rgba(139,92,246,0.22);' : ''}
        >{seg.text}</span>{/each}</div>
        <div class="overlap-legend" aria-hidden="true">
          <span class="legend-swatch" style="background:rgba(59,130,246,0.35);"></span><span class="legend-label">overlap with previous</span>
          <span class="legend-swatch" style="background:rgba(249,115,22,0.35);"></span><span class="legend-label">overlap with next</span>
        </div>
      </div>
    {/if}

    <div class="console">
      <div class="console-prompt" aria-hidden="true">
        <span class="prompt-caret">›</span>
        <span class="prompt-file">{promptLine(chunk, exportFormat)}</span>
      </div>
      <div class="console-body">
        <div class="gutter" aria-hidden="true">
          {#each lines as _, li}
            <span class="ln">{li + 1}</span>
          {/each}
        </div>
        <code class="output">
          {#each lines as line, li}
            <span class="line">{@html line}</span>
          {/each}
        </code>
      </div>
    </div>
  {/if}
</div>

<style>
  .chunk-preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    background: var(--bg);
    min-width: 0;
    overflow: hidden;
    width: 100%;
  }

  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .empty-hint {
    font-size: 12px;
    color: var(--muted);
  }

  /* ── toolbar ── */

  .preview-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: nowrap;
    height: 32px;
    padding: 0 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow: hidden;
  }

  .chunk-id {
    font-size: 12px;
    color: var(--ink-dim);
    white-space: nowrap;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .fmt-badge {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 4px;
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .nav-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    color: var(--ink-dim);
    padding: 0 4px;
    line-height: 1;
    border-radius: 2px;
  }
  .nav-btn:hover:not(:disabled) { background: var(--border); color: var(--ink); }
  .nav-btn:disabled { opacity: 0.3; cursor: default; }

  .nav-pos {
    font-size: 11px;
    color: var(--muted);
    min-width: 36px;
    text-align: center;
  }

  /* ── stats bar ── */

  .stats-bar {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    padding: 5px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow: hidden;
    background: var(--surface);
  }

  .stat { font-size: 11px; color: var(--ink-dim); white-space: nowrap; flex-shrink: 0; }
  .stat-val { color: var(--accent); }
  .sep { color: var(--muted); font-size: 11px; white-space: nowrap; flex-shrink: 0; }

  /* ── console ── */

  .console {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #090c10;
    overflow: hidden;
    min-height: 0;
  }

  .console-prompt {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px 6px;
    border-bottom: 1px solid #1a1f28;
    flex-shrink: 0;
    background: #0b0e14;
  }

  .prompt-caret {
    color: var(--ok);
    font-size: 13px;
    line-height: 1;
    user-select: none;
  }

  .prompt-file {
    font-size: 12px;
    color: var(--ink-dim);
    font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
  }

  .console-body {
    flex: 1;
    display: flex;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    padding: 12px 0;
  }

  .gutter {
    display: flex;
    flex-direction: column;
    padding: 0 10px 0 14px;
    flex-shrink: 0;
    user-select: none;
    border-right: 1px solid #1a1f28;
    margin-right: 14px;
  }

  .ln {
    font-size: 11px;
    line-height: 1.7;
    color: #3a3f4a;
    text-align: right;
    min-width: 18px;
    display: block;
    font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
  }

  .output {
    flex: 1;
    display: flex;
    flex-direction: column;
    font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .line {
    display: block;
    min-height: 1.7em;
    padding-right: 16px;
  }

  /* syntax token colors */
  .output :global(.t-key)   { color: var(--syntax-key); }
  .output :global(.t-str)   { color: var(--syntax-str); }
  .output :global(.t-num)   { color: var(--syntax-num); }
  .output :global(.t-bool)  { color: #7ab0d8; opacity: 0.75; }
  .output :global(.t-punct) { color: var(--syntax-punct); }

  /* ── overlap toggle ── */
  .overlap-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--accent);
    padding: 0;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .overlap-toggle:hover { text-decoration: underline; }

  /* ── overlap text view ── */
  .overlap-view {
    flex-shrink: 0;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 10px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .overlap-text {
    font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.65;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-height: 180px;
    overflow-y: auto;
  }

  .overlap-legend {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .legend-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .legend-label {
    font-size: 11px;
    color: var(--ink-dim);
    margin-right: 6px;
  }
</style>
