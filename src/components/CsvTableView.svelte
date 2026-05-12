<script lang="ts">
  import { parseCsvRow } from '../lib/file-parse';

  interface Props {
    csvText: string;
    delimiter?: string;
    hasHeader?: boolean;
  }
  let { csvText, delimiter = ',', hasHeader = true }: Props = $props();

  function parseCsv(text: string, delim: string): string[][] {
    if (!text.trim()) return [];
    const lines = text.split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.map(line => {
      if (delim === ',') return parseCsvRow(line);
      return line.split(delim).map(f => f.replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
    });
  }

  let allRows = $derived(parseCsv(csvText, delimiter));
  let colCount = $derived(allRows.reduce((max, r) => Math.max(max, r.length), 0));
  let headers = $derived(
    hasHeader && allRows.length > 0
      ? allRows[0]
      : Array.from({ length: colCount }, (_, i) => String.fromCharCode(65 + i))
  );
  let dataRows = $derived(hasHeader && allRows.length > 0 ? allRows.slice(1) : allRows);

  let colWidths = $state<number[]>([]);

  $effect(() => {
    const needed = headers.length;
    if (colWidths.length !== needed) {
      colWidths = Array.from({ length: needed }, (_, colIdx) => {
        let maxLen = headers[colIdx]?.length ?? 4;
        const sampleRows = dataRows.slice(0, 50);
        for (const row of sampleRows) {
          const clen = row[colIdx]?.length ?? 0;
          if (clen > maxLen) maxLen = clen;
        }
        return Math.min(300, Math.max(60, maxLen * 7.5 + 16));
      });
    }
  });

  // ── Cell selection ──────────────────────────────────────────────────────
  let selectedCell = $state<{ row: number; col: number } | null>(null);

  let cellRef = $derived(
    selectedCell != null
      ? (headers[selectedCell.col] ?? String.fromCharCode(65 + selectedCell.col))
      : ''
  );
  let cellRowNum = $derived(selectedCell != null ? selectedCell.row + 1 : null);
  let cellValue = $derived(
    selectedCell != null
      ? (dataRows[selectedCell.row]?.[selectedCell.col] ?? '')
      : ''
  );

  function selectCell(row: number, col: number) {
    if (selectedCell?.row === row && selectedCell?.col === col) {
      selectedCell = null;
    } else {
      selectedCell = { row, col };
    }
  }

  // ── Column resize ───────────────────────────────────────────────────────
  let resizing: { colIdx: number; startX: number; startW: number } | null = null;
  let isResizing = $state(false);

  function startResize(e: MouseEvent, colIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    resizing = { colIdx, startX: e.clientX, startW: colWidths[colIdx] ?? 120 };
    isResizing = true;
  }

  function onMouseMove(e: MouseEvent) {
    if (!resizing) return;
    const delta = e.clientX - resizing.startX;
    const newW = Math.max(50, resizing.startW + delta);
    colWidths = colWidths.map((w, i) => i === resizing!.colIdx ? newW : w);
  }

  function onMouseUp() {
    resizing = null;
    isResizing = false;
  }
</script>

<svelte:window onmousemove={onMouseMove} onmouseup={onMouseUp} />

<div class="csv-outer">
  <!-- Formula bar (Google Sheets style) -->
  <div class="formula-bar">
    <div class="fb-ref">
      {#if selectedCell != null}
        <span class="fb-col" title={cellRef}>{cellRef}</span>
        <span class="fb-dot">·</span>
        <span class="fb-row">{cellRowNum}</span>
      {:else}
        <span class="fb-placeholder">—</span>
      {/if}
    </div>
    <div class="fb-val-wrap">
      <span class="fb-val">{cellValue}</span>
    </div>
  </div>

  <!-- Scrollable table area -->
  <div class="csv-scroll" class:resizing={isResizing}>
    {#if allRows.length === 0}
      <div class="csv-empty">no data</div>
    {:else}
      <table>
        <colgroup>
          <col style="width:44px" />
          {#each colWidths as w}
            <col style="width:{w}px" />
          {/each}
        </colgroup>
        <thead>
          <tr>
            <th class="row-num" aria-label="Row">#</th>
            {#each headers as h, i}
              <th>
                <span class="th-text" title={h}>{h}</span>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="rh"
                  onmousedown={(e) => startResize(e, i)}
                  aria-hidden="true"
                ></div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each dataRows as row, rowIdx}
            <tr>
              <td class="row-num">{rowIdx + 1}</td>
              {#each headers as _, colIdx}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <td
                  class:selected={selectedCell?.row === rowIdx && selectedCell?.col === colIdx}
                  onclick={() => selectCell(rowIdx, colIdx)}
                  title={row[colIdx] ?? ''}
                >{row[colIdx] ?? ''}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .csv-outer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--bg);
  }

  /* ── Formula bar ────────────────────────────────────────────────── */
  .formula-bar {
    display: flex;
    align-items: center;
    height: 28px;
    flex-shrink: 0;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    overflow: hidden;
  }

  .fb-ref {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 90px;
    max-width: 160px;
    padding: 0 10px;
    border-right: 1px solid var(--border);
    height: 100%;
    flex-shrink: 0;
    overflow: hidden;
  }

  .fb-col {
    font-weight: 600;
    color: var(--ink);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 90px;
  }

  .fb-dot {
    color: var(--muted);
    font-size: 11px;
    flex-shrink: 0;
  }

  .fb-row {
    color: var(--muted);
    font-size: 11px;
    flex-shrink: 0;
  }

  .fb-placeholder {
    color: var(--muted);
    font-size: 11px;
  }

  .fb-val-wrap {
    flex: 1;
    overflow: hidden;
    padding: 0 10px;
    display: flex;
    align-items: center;
  }

  .fb-val {
    font-size: 12px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  /* ── Scroll area ────────────────────────────────────────────────── */
  .csv-scroll {
    flex: 1;
    overflow: auto;
    background: var(--bg);
  }

  .csv-scroll.resizing {
    user-select: none;
    cursor: col-resize;
  }

  .csv-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    font-size: 12px;
  }

  /* ── Table ──────────────────────────────────────────────────────── */
  table {
    border-collapse: collapse;
    table-layout: fixed;
    min-width: 100%;
    font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.4;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 2;
  }

  th {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink);
    font-weight: 700;
    padding: 4px 8px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    user-select: none;
  }

  th .th-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 6px;
  }

  th.row-num {
    color: var(--muted);
    font-weight: 400;
    font-size: 11px;
    text-align: center;
    background: var(--surface);
  }

  td {
    border: 1px solid var(--border);
    color: var(--ink-dim);
    padding: 3px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 0;
    cursor: cell;
  }

  td.row-num {
    color: var(--muted);
    font-size: 11px;
    text-align: center;
    background: var(--surface);
    border-color: var(--border);
    cursor: default;
  }

  tbody tr:nth-child(even) td:not(.selected) {
    background: color-mix(in srgb, var(--surface) 50%, transparent);
  }

  tbody tr:hover td:not(.selected):not(.row-num) {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    color: var(--ink);
  }

  td.selected {
    background: color-mix(in srgb, var(--accent) 14%, transparent) !important;
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    color: var(--ink);
  }

  /* Column resize handle */
  .rh {
    position: absolute;
    right: 0;
    top: 0;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 1;
  }

  .rh:hover {
    background: var(--accent);
    opacity: 0.6;
  }

  .csv-scroll.resizing .rh {
    background: var(--accent);
    opacity: 0.8;
  }
</style>
