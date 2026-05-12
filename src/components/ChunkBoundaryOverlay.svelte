<script lang="ts">
  import { chunkState } from '../stores/chunkState';
  import { enrichChunks } from '../lib/rag-metadata';

  // The overlay sits on top of the editor-wrap div.
  // It measures its own height and maps char offsets → pixel Y positions
  // using a hidden <textarea> mirror that replicates the editor's line wrapping.

  interface Props {
    containerEl: HTMLElement | undefined;
    onresetToAuto: () => void;
  }
  const { containerEl, onresetToAuto }: Props = $props();

  let overlayEl: HTMLDivElement | undefined = $state();

  // Build list of boundary offsets from chunks (all inter-chunk boundaries, not start/end)
  let boundaries = $derived.by(() => {
    const chunks = $chunkState.chunks;
    if (chunks.length < 2) return [] as { offset: number; isManual: boolean; index: number }[];
    const manuals = new Set($chunkState.manualBoundaries ?? []);
    return chunks.slice(0, -1).map((c, i) => ({
      offset: c.endOffset,
      isManual: manuals.has(c.endOffset),
      index: i,
    }));
  });

  // ── Mirror textarea to map char offset → pixel Y ─────────────────────────
  // We write the source text into a hidden textarea that matches the editor's
  // CSS exactly, then use selectionStart to getBoundingClientRect of a Range.
  // A simpler approach: count newlines up to offset and multiply by line height.

  function getLineHeight(): number {
    if (!containerEl) return 20;
    const style = getComputedStyle(containerEl);
    const lh = parseFloat(style.lineHeight);
    return isNaN(lh) ? 20 : lh;
  }

  function charOffsetToY(offset: number, text: string): number {
    const linesBefore = text.slice(0, offset).split('\n').length - 1;
    const lh = getLineHeight();
    return linesBefore * lh;
  }

  // ── Drag state ────────────────────────────────────────────────────────────

  let draggingIndex = $state<number | null>(null);
  let dragStartY = $state(0);
  let dragCurrentY = $state(0);

  function onHandleMousedown(e: MouseEvent, boundaryIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    draggingIndex = boundaryIndex;
    dragStartY = e.clientY;
    dragCurrentY = e.clientY;

    function onMove(ev: MouseEvent) {
      dragCurrentY = ev.clientY;
    }

    function onUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (draggingIndex === null) return;
      const deltaY = ev.clientY - dragStartY;
      applyDrag(draggingIndex, deltaY);
      draggingIndex = null;
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function applyDrag(boundaryIndex: number, deltaY: number) {
    const text = $chunkState.sourceText;
    if (!text || !containerEl) return;

    const chunks = $chunkState.chunks;
    if (chunks.length < 2) return;

    const lh = getLineHeight();
    const deltaLines = Math.round(deltaY / lh);
    if (deltaLines === 0) return;

    // Find current boundary offset
    const currentOffset = chunks[boundaryIndex].endOffset;
    const prevChunkStart = chunks[boundaryIndex].startOffset;
    const nextChunkEnd = chunks[boundaryIndex + 1].endOffset;

    // Map deltaLines to a char offset delta by counting chars per line
    const lines = text.split('\n');
    let charCount = 0;
    let currentLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= currentOffset) {
        currentLine = i;
        break;
      }
      charCount += lines[i].length + 1; // +1 for \n
    }

    const targetLine = Math.max(0, Math.min(lines.length - 1, currentLine + deltaLines));
    // Rebuild char offset for targetLine start
    let newOffset = 0;
    for (let i = 0; i < targetLine; i++) {
      newOffset += lines[i].length + 1;
    }
    // Clamp: must stay within [prevChunkStart+1 .. nextChunkEnd-1]
    newOffset = Math.max(prevChunkStart + 1, Math.min(nextChunkEnd - 1, newOffset));

    // Build new manual boundaries from existing chunk endOffsets, replacing the moved one
    const existing: number[] = $chunkState.manualBoundaries ?? chunks.slice(0, -1).map(c => c.endOffset);
    const updated = [...existing];
    updated[boundaryIndex] = newOffset;
    updated.sort((a, b) => a - b);

    rebuildFromBoundaries(text, updated);
  }

  async function rebuildFromBoundaries(text: string, boundaries: number[]) {
    const sorted = [...new Set(boundaries)].sort((a, b) => a - b);
    const rawChunks: { text: string; startOffset: number; endOffset: number }[] = [];
    let prev = 0;
    for (const off of sorted) {
      if (off <= prev || off >= text.length) continue;
      rawChunks.push({ text: text.slice(prev, off), startOffset: prev, endOffset: off });
      prev = off;
    }
    if (prev < text.length) {
      rawChunks.push({ text: text.slice(prev), startOffset: prev, endOffset: text.length });
    }

    const enriched = await enrichChunks(rawChunks.filter(r => r.text.trim().length > 0));
    chunkState.update(s => ({
      ...s,
      chunks: enriched,
      manualBoundaries: sorted,
    }));
  }

  function resetToAuto() {
    chunkState.update(s => ({ ...s, manualBoundaries: null }));
    onresetToAuto();
  }

  // ── Computed marker positions ─────────────────────────────────────────────
  let markerPositions = $derived.by(() => {
    const text = $chunkState.sourceText;
    const bs = boundaries;
    if (!text || bs.length === 0) return [] as { y: number; offset: number; isManual: boolean; index: number }[];
    return bs.map(b => ({
      ...b,
      y: charOffsetToY(b.offset, text),
    }));
  });

  let hasManual = $derived($chunkState.manualBoundaries !== null);
</script>

{#if $chunkState.chunks.length >= 2 && $chunkState.sourceText}
  <div
    bind:this={overlayEl}
    class="boundary-overlay"
    aria-hidden="true"
  >
    {#each markerPositions as marker}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="boundary-line"
        class:is-manual={marker.isManual}
        class:is-dragging={draggingIndex === marker.index}
        style="top: {marker.y + (draggingIndex === marker.index ? dragCurrentY - dragStartY : 0)}px"
        onmousedown={(e) => onHandleMousedown(e, marker.index)}
        title="Drag to move boundary · {marker.isManual ? 'manually set' : 'auto'}"
      >
        <div class="boundary-handle">
          <span class="handle-grip">⋮⋮</span>
          {#if marker.isManual}
            <span class="manual-dot" aria-label="manually edited boundary"></span>
          {/if}
        </div>
      </div>
    {/each}

    {#if hasManual}
      <button
        class="reset-btn"
        onclick={resetToAuto}
        title="Reset all boundaries to automatic chunking strategy"
      >reset to auto</button>
    {/if}
  </div>
{/if}

<style>
  .boundary-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
  }

  .boundary-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: color-mix(in srgb, var(--accent) 40%, transparent);
    cursor: ns-resize;
    pointer-events: all;
    transition: background 0.1s;
    display: flex;
    align-items: center;
  }

  .boundary-line:hover,
  .boundary-line.is-dragging {
    background: var(--accent);
    z-index: 20;
  }

  .boundary-line.is-manual {
    background: color-mix(in srgb, #f59e0b 50%, transparent);
  }

  .boundary-line.is-manual:hover,
  .boundary-line.is-manual.is-dragging {
    background: #f59e0b;
  }

  .boundary-handle {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 0 4px;
    height: 14px;
    pointer-events: none;
    font-size: 9px;
    line-height: 1;
  }

  .handle-grip {
    color: var(--ink-dim);
    letter-spacing: -1px;
    font-size: 9px;
  }

  .manual-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    flex-shrink: 0;
  }

  .reset-btn {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: var(--surface);
    border: 1px solid #f59e0b;
    border-radius: 2px;
    color: #f59e0b;
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    pointer-events: all;
    opacity: 0.85;
  }

  .reset-btn:hover {
    opacity: 1;
    background: color-mix(in srgb, #f59e0b 12%, var(--surface));
  }
</style>
