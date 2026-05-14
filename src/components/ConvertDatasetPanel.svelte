<script lang="ts">
  import { convertState, type ExportFormat } from '../stores/convertState';
  import { openFile } from '../stores/editorState';
  import { setTab } from '../stores/shellState';

  const FORMAT_OPTIONS: ExportFormat[] = ['jsonl', 'json', 'csv', 'parquet', 'md', 'txt', 'alpaca', 'sharegpt'];

  interface Props {
    selectedId: string | undefined;
    globalFormat: ExportFormat;
    onselect: (id: string) => void;
    onremove: (id: string) => void;
    onclear: () => void;
    oncombine: () => void;
    onreorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
    onbulkremove: (ids: string[]) => void;
    onbulkcombine: (ids: string[]) => void;
    onformatchange: (id: string, fmt: ExportFormat | null) => void;
  }
  const { selectedId, globalFormat, onselect, onremove, onclear, oncombine, onreorder, onbulkremove, onbulkcombine, onformatchange }: Props = $props();

  function openInEditor(file: { id: string; name: string; content: string; rawSource?: string }) {
    openFile(file.name, file.rawSource ?? file.content);
    setTab('editor');
  }

  let files = $derived($convertState.datasetFiles);
  let totalRecords = $derived(files.reduce((sum, f) => sum + f.lineCount, 0));

  // ── Multi-select ──────────────────────────────────────────────────────────
  let selectedIds = $state(new Set<string>());
  let anchorId = $state<string | null>(null);

  function handleRowClick(e: MouseEvent, id: string) {
    if (e.shiftKey && anchorId) {
      const ids = files.map(f => f.id);
      const anchorIdx = ids.indexOf(anchorId);
      const clickIdx = ids.indexOf(id);
      const [lo, hi] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
      selectedIds = new Set(ids.slice(lo, hi + 1));
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectedIds);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      selectedIds = next;
      anchorId = id;
    } else {
      selectedIds = new Set([id]);
      anchorId = id;
      onselect(id);
    }
  }

  function handleRowKeydown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectedIds = new Set([id]);
      anchorId = id;
      onselect(id);
    }
  }

  // ── Drag-reorder ──────────────────────────────────────────────────────────
  let draggingId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let dragPosition = $state<'before' | 'after'>('before');
  let handleMousedownId = $state<string | null>(null);

  function onHandleMousedown(id: string) {
    handleMousedownId = id;
  }

  function onRowDragstart(e: DragEvent, id: string) {
    if (handleMousedownId !== id) { e.preventDefault(); return; }
    draggingId = id;
    e.dataTransfer?.setData('text/plain', id);
  }

  function onRowDragover(e: DragEvent, id: string) {
    e.preventDefault();
    dragOverId = id;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function onRowDragleave() {
    dragOverId = null;
  }

  function onRowDrop(e: DragEvent, id: string) {
    e.preventDefault();
    const srcId = e.dataTransfer?.getData('text/plain') ?? draggingId;
    if (srcId && srcId !== id) {
      onreorder(srcId, id, dragPosition);
    }
    draggingId = null;
    dragOverId = null;
    handleMousedownId = null;
  }

  function onRowDragend() {
    draggingId = null;
    dragOverId = null;
    handleMousedownId = null;
  }
</script>

<div class="dataset-panel">
  <div class="panel-header">
    <span class="panel-label">dataset</span>
    <span class="total-count">{totalRecords} records</span>
  </div>

  <div class="file-list">
    {#each files as file (file.id)}
      {@const isDropTarget = dragOverId === file.id}
      <div
        class="file-row"
        class:selected={selectedId === file.id}
        class:multi={selectedIds.has(file.id)}
        class:drag-over-before={isDropTarget && dragPosition === 'before'}
        class:drag-over-after={isDropTarget && dragPosition === 'after'}
        role="button"
        tabindex="0"
        aria-label="Select {file.name}"
        aria-selected={selectedId === file.id}
        draggable={handleMousedownId === file.id}
        onclick={(e) => handleRowClick(e, file.id)}
        onkeydown={(e) => handleRowKeydown(e, file.id)}
        ondragstart={(e) => onRowDragstart(e, file.id)}
        ondragover={(e) => onRowDragover(e, file.id)}
        ondragleave={onRowDragleave}
        ondrop={(e) => onRowDrop(e, file.id)}
        ondragend={onRowDragend}
      >
        <div class="file-row-top">
          <span
            class="drag-handle"
            aria-hidden="true"
            onmousedown={() => onHandleMousedown(file.id)}
            onmouseup={() => { if (handleMousedownId === file.id && !draggingId) handleMousedownId = null; }}
          >⠿</span>
          <span class="file-name" title={file.name}>{file.name}</span>
        </div>
        <div class="file-row-bottom">
          <select
            class="fmt-select"
            value={file.formatOverride ?? ''}
            onchange={(e) => {
              const val = (e.currentTarget as HTMLSelectElement).value;
              onformatchange(file.id, val === '' ? null : val as ExportFormat);
            }}
            onclick={(e) => e.stopPropagation()}
            title="Format override for {file.name}"
            aria-label="Format for {file.name}"
          >
            <option value="">auto</option>
            {#each FORMAT_OPTIONS as fmt}
              <option value={fmt}>{fmt}</option>
            {/each}
          </select>
          <button
            class="open-editor-btn"
            onclick={(e) => { e.stopPropagation(); openInEditor(file); }}
            title="Open {file.name} in Editor tab"
            aria-label="Open {file.name} in Editor tab"
          >↗ Editor</button>
          <button
            class="remove-btn"
            onclick={(e) => { e.stopPropagation(); onremove(file.id); }}
            title="Remove {file.name}"
            aria-label="Remove {file.name}"
          >×</button>
        </div>
      </div>
    {/each}

    {#if files.length === 0}
      <div class="empty-list">no files loaded</div>
    {/if}
  </div>

  <div class="panel-footer">
    {#if selectedIds.size >= 2}
      <button
        class="footer-btn footer-btn-accent"
        onclick={() => onbulkremove([...selectedIds])}
        title="Remove selected files"
      >remove {selectedIds.size}</button>
      <button
        class="footer-btn footer-btn-accent"
        onclick={() => { onbulkcombine([...selectedIds]); selectedIds = new Set(); }}
        title="Combine selected files"
      >combine {selectedIds.size}</button>
    {:else}
      <button class="footer-btn" onclick={oncombine} disabled={files.length < 2} title="Merge all files into one in the editor">
        combine
      </button>
      <button class="footer-btn" onclick={onclear} disabled={files.length === 0}>
        clear all
      </button>
    {/if}
  </div>
</div>

<style>
  .dataset-panel {
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    background: var(--bg);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .panel-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
  }

  .total-count {
    font-size: 11px;
    color: var(--accent);
    white-space: nowrap;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
    min-height: 0;
  }

  .file-row {
    display: flex;
    flex-direction: column;
    padding: 6px 8px 8px 4px;
    font-size: 12px;
    cursor: pointer;
    gap: 5px;
    position: relative;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  .file-row-top {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .file-row-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 18px; /* line up with .file-name (after drag handle) */
  }

  .file-row:hover { background: var(--surface); }
  .file-row.selected { background: var(--surface); }
  .file-row.multi { background: color-mix(in srgb, var(--accent) 8%, var(--bg)); }

  .file-row.drag-over-before::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    pointer-events: none;
  }

  .file-row.drag-over-after::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    pointer-events: none;
  }

  .drag-handle {
    color: var(--muted);
    font-size: 11px;
    cursor: grab;
    padding: 0 2px;
    flex-shrink: 0;
    opacity: 0;
    user-select: none;
  }

  .file-row:hover .drag-handle { opacity: 1; }

  .file-name {
    flex: 1;
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .file-row.selected .file-name { color: var(--ink); }

  /* Shared sizing for the three controls on the bottom row so they line
     up visually: same height, same font, same padding. Each keeps its own
     colour treatment (neutral select, accent editor, red-on-hover remove). */
  .fmt-select,
  .open-editor-btn,
  .remove-btn {
    height: 24px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-size: 11px;
    padding: 0 8px;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1;
  }

  .fmt-select {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--ink-dim);
    font-size: 12px;
    min-width: 64px;
  }
  .fmt-select:focus { outline: 1px solid var(--accent); }

  .open-editor-btn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--accent);
  }
  .open-editor-btn:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  .remove-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    font-weight: 600;
    font-size: 16px;
    min-width: 32px;
    padding: 0 6px;
  }
  .remove-btn:hover { color: var(--err); border-color: var(--err); background: color-mix(in srgb, var(--err) 12%, transparent); }

  .empty-list {
    padding: 12px;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }

  .panel-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }

  .footer-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    color: var(--ink-dim);
  }

  .footer-btn:hover:not(:disabled) { background: var(--border); color: var(--ink); }
  .footer-btn:disabled { opacity: 0.3; cursor: default; }

  .footer-btn-accent {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    color: var(--accent);
  }
  .footer-btn-accent:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
