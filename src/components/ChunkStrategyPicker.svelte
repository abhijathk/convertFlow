<script lang="ts">
  import { chunkState } from '../stores/chunkState';
  import type { ChunkStrategy } from '../stores/chunkState';

  interface Props {
    onImport?: () => void;
    onFolder?: () => void;
    onEditor?: () => void;
    onUtilities?: () => void;
    actionsDisabled?: boolean;
  }
  let { onImport, onFolder, onEditor, onUtilities, actionsDisabled = false }: Props = $props();

  const strategies: { id: ChunkStrategy; label: string; badge?: string; description: string }[] = [
    {
      id: 'semantic',
      label: 'Semantic',
      badge: 'beta',
      description: 'Uses local bag-of-words similarity. For better semantic chunks, use an external embedding model. Groups sentences by topic similarity using Jaccard overlap. Best for mixed content.',
    },
    {
      id: 'fixed',
      label: 'Fixed',
      description: 'Splits at token count boundaries with word overlap bridge. Predictable, reproducible.',
    },
    {
      id: 'paragraph',
      label: 'Paragraph',
      description: 'Splits on blank lines and headings. Best for structured markdown/docs.',
    },
    {
      id: 'embedding',
      label: 'Embedding',
      badge: 'best',
      description: 'Embedding-based semantic chunking. Splits at sentences where the topic shifts. Slowest, highest quality. Downloads ~23 MB model on first use.',
    },
  ];

  const sizeHints: Record<ChunkStrategy, string> = {
    semantic: 'Larger chunks (512-768) capture complete topics and semantic relationships.',
    fixed: "Match to your model's context window. Smaller = more precise retrieval.",
    paragraph: 'Maximum size to merge small paragraphs. Oversized paragraphs split automatically.',
    embedding: 'Token budget per chunk. Embedding splits are also bounded by this limit.',
  };

  const overlapHints: Record<ChunkStrategy, string> = {
    semantic: 'Higher overlap (80-120 tokens) preserves semantic context and topic continuity across chunks.',
    fixed: 'Overlap bridges context across fixed chunk boundaries.',
    paragraph: 'Paragraph strategy splits at natural boundaries — overlap is not applied.',
    embedding: 'Embedding strategy splits at topic-shift boundaries — overlap is not applied.',
  };

  let strategy = $derived($chunkState.strategy);
  let chunkSize = $derived($chunkState.chunkSize);
  let chunkOverlap = $derived($chunkState.chunkOverlap);
  let enableImages = $derived($chunkState.enableImages);
  let enableOcr = $derived($chunkState.enableOcr);
  let maxKeywords = $derived($chunkState.maxKeywords);
  let lateChunking = $derived($chunkState.lateChunking);

  function pick(id: ChunkStrategy) {
    chunkState.update(s => ({ ...s, strategy: id }));
  }

  function setChunkSize(e: Event) {
    const val = Number((e.target as HTMLInputElement).value);
    chunkState.update(s => ({
      ...s,
      chunkSize: val,
      chunkOverlap: Math.min(s.chunkOverlap, Math.floor(val * 0.5)),
    }));
  }

  function setChunkOverlap(e: Event) {
    const val = Number((e.target as HTMLInputElement).value);
    chunkState.update(s => ({ ...s, chunkOverlap: Math.min(val, Math.floor(s.chunkSize * 0.5)) }));
  }

  function toggleImages() {
    chunkState.update(s => ({ ...s, enableImages: !s.enableImages }));
  }

  function toggleOcr() {
    chunkState.update(s => ({ ...s, enableOcr: !s.enableOcr }));
  }

  function setMaxKeywords(e: Event) {
    const val = Math.max(0, Math.min(10, Number((e.target as HTMLInputElement).value)));
    chunkState.update(s => ({ ...s, maxKeywords: val }));
  }

  function toggleLateChunking() {
    chunkState.update(s => ({ ...s, lateChunking: !s.lateChunking }));
  }
</script>

<!-- Row 1: Strategy tabs -->
<div class="strategy-picker">
  <div class="strategy-tabs" role="radiogroup" aria-label="Chunking strategy">
    {#each strategies as s}
      <button
        role="radio"
        aria-checked={strategy === s.id}
        class:active={strategy === s.id}
        onclick={() => pick(s.id)}
        title={s.description}
      >
        {s.label}{#if s.badge}<span class="strategy-badge" class:strategy-badge-best={s.badge === 'best'}>{s.badge}</span>{/if}
      </button>
    {/each}
  </div>
  {#if onImport || onFolder || onEditor || onUtilities}
    <div class="strategy-actions">
      {#if onImport}
        <button
          class="strategy-action-btn import"
          onclick={onImport}
          title="Import a file"
        >import ↓</button>
      {/if}
      {#if onFolder}
        <button
          class="strategy-action-btn"
          onclick={onFolder}
          title="Import a folder of files"
        >folder ↓</button>
      {/if}
      {#if onEditor}
        <button
          class="strategy-action-btn"
          onclick={onEditor}
          disabled={actionsDisabled}
          title="Edit source in Editor tab"
        >↗ Editor</button>
      {/if}
      {#if onUtilities}
        <button
          class="strategy-action-btn"
          onclick={onUtilities}
          disabled={actionsDisabled}
          title="Analyze source in Utilities tab"
        >↗ Utilities</button>
      {/if}
    </div>
  {/if}
</div>

<!-- Row 2: Chunk Size + Overlap sliders -->
<div class="sliders-row">
  <div class="slider-col" class:full-width={strategy === 'paragraph'}>
    <div class="slider-header">
      <span class="slider-label">Chunk Size</span>
      <span class="slider-value">{chunkSize}t</span>
    </div>
    <input
      type="range"
      min="128"
      max="2048"
      step="64"
      value={chunkSize}
      oninput={setChunkSize}
      aria-label="Chunk size in tokens"
      class="slider"
    />
    <p class="slider-hint">{sizeHints[strategy]}</p>
  </div>

  {#if strategy !== 'paragraph'}
    <div class="slider-col">
      <div class="slider-header">
        <span class="slider-label">Overlap</span>
        <span class="slider-value">{chunkOverlap}t</span>
      </div>
      <input
        type="range"
        min="0"
        max={Math.floor(chunkSize * 0.5)}
        step="8"
        value={chunkOverlap}
        oninput={setChunkOverlap}
        aria-label="Chunk overlap in tokens"
        class="slider"
      />
      <p class="slider-hint">{overlapHints[strategy]}</p>
    </div>
  {/if}
</div>

<!-- Row 3: Processing Options -->
<div class="processing-row">
  <span class="processing-label">Processing Options:</span>

  <label class="toggle-label" title="Accept image files (PNG, JPG, WEBP, GIF) and extract text via OCR">
    <input
      type="checkbox"
      checked={enableImages}
      onchange={toggleImages}
      aria-label="Enable image file imports"
    />
    <span class="toggle-name">Images</span>
  </label>

  <label class="toggle-label" title="Run OCR on scanned PDF pages and embedded DOCX images">
    <input
      type="checkbox"
      checked={enableOcr}
      onchange={toggleOcr}
      aria-label="Enable OCR for scanned documents"
    />
    <span class="toggle-name">OCR</span>
  </label>

  <span class="sep-dot" aria-hidden="true">·</span>

  <label
    class="toggle-label late-chunk-label"
    title="Late chunking embeds the whole document first, then mean-pools token embeddings per chunk span — preserving cross-chunk context. Based on Günther et al., Jina AI, EMNLP 2024 (arxiv 2409.04701). Downloads ~23 MB model on first use."
  >
    <input
      type="checkbox"
      checked={lateChunking}
      onchange={toggleLateChunking}
      aria-label="Enable late chunking to preserve cross-chunk context in embeddings"
    />
    <span class="toggle-name">Late chunking</span>
    <a
      class="late-chunk-help"
      href="https://arxiv.org/abs/2409.04701"
      target="_blank"
      rel="noopener noreferrer"
      title="Günther et al., Late Chunking, EMNLP 2024 — arxiv 2409.04701"
      aria-label="Late chunking paper (opens in new tab)"
      onclick={(e) => e.stopPropagation()}
    >?</a>
  </label>

  <span class="sep-dot" aria-hidden="true">·</span>
  <span class="processing-label">Keywords:</span>
  <input
    class="keywords-input"
    type="number"
    min="0"
    max="10"
    value={maxKeywords}
    onchange={setMaxKeywords}
    aria-label="Max keywords per chunk (0 to hide)"
    title="Max keywords shown per chunk (0 = hidden)"
  />
</div>

<style>
  /* ── Row 1: strategy tabs ───────────────────────────────────── */
  .strategy-picker {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 16px;
    height: 36px;
    gap: 12px;
    flex-shrink: 0;
  }

  .strategy-tabs {
    display: flex;
    align-items: stretch;
    gap: 0;
  }

  .strategy-tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink-dim);
    margin-bottom: -1px;
    transition: color 0.1s;
  }

  .strategy-tabs button:hover { color: var(--ink); }

  .strategy-tabs button.active {
    color: var(--ink);
    font-weight: 700;
  }

  .strategy-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Match the Convert toolbar's .actions button styling — accent text,
     accent-tinted border for Editor/Utilities, neutral border for Import.
     Import is slightly larger as the primary entry-point action. */
  .strategy-action-btn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
    transition: background 0.1s, border-color 0.1s;
    white-space: nowrap;
  }
  .strategy-action-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-color: var(--accent);
  }
  .strategy-action-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .strategy-action-btn.import {
    font-size: 13px;
    padding: 3px 10px;
    font-weight: 500;
    /* Import keeps the accent style for consistency with the primary
       entry-point button on the Convert page. */
  }

  .strategy-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #f59e0b;
    border: 1px solid color-mix(in srgb, #f59e0b 50%, transparent);
    border-radius: 2px;
    padding: 0 3px;
    margin-left: 4px;
    vertical-align: middle;
    line-height: 12px;
  }

  /* "best" badge gets green accent */
  .strategy-badge-best {
    color: #22c55e;
    border-color: color-mix(in srgb, #22c55e 50%, transparent);
  }

  /* ── Row 2: sliders ─────────────────────────────────────────── */
  .sliders-row {
    display: flex;
    gap: 0;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 8px 16px;
    flex-shrink: 0;
  }

  .slider-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .slider-col:first-child:not(.full-width) {
    padding-right: 16px;
    border-right: 1px solid var(--border);
    margin-right: 16px;
  }

  .slider-col.full-width {
    max-width: 50%;
  }

  .slider-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .slider-label {
    font-size: 12px;
    color: var(--ink-dim);
    font-family: inherit;
  }

  .slider-value {
    font-size: 12px;
    color: var(--accent);
    font-weight: 500;
    font-family: inherit;
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 12px;
    background: transparent;
    outline: none;
    cursor: pointer;
    padding: 0;
    margin: 2px 0;
  }
  .slider::-webkit-slider-runnable-track {
    height: 1px;
    background: var(--accent);
    border: none;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -5.5px;
    background: transparent url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><text x='6' y='10' text-anchor='middle' font-size='14' font-family='monospace' fill='%23e0a84e'>*</text></svg>") no-repeat center;
    background-size: 12px 12px;
    border: none;
    cursor: pointer;
  }
  .slider::-moz-range-track {
    height: 1px;
    background: var(--accent);
    border: none;
  }
  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: transparent url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><text x='6' y='10' text-anchor='middle' font-size='14' font-family='monospace' fill='%23e0a84e'>*</text></svg>") no-repeat center;
    background-size: 12px 12px;
    border: none;
    border-radius: 0;
    cursor: pointer;
  }

  .slider-hint {
    font-size: 11px;
    color: var(--ink-dim);
    line-height: 1.4;
    margin: 0;
    font-family: inherit;
  }

  /* ── Row 3: processing options ──────────────────────────────── */
  .processing-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 16px;
    height: 28px;
    flex-shrink: 0;
  }

  .processing-label {
    font-size: 12px;
    color: var(--ink-dim);
    font-family: inherit;
    flex-shrink: 0;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-family: inherit;
  }

  .toggle-label input[type='checkbox'] {
    accent-color: var(--accent);
    cursor: pointer;
    width: 13px;
    height: 13px;
    margin: 0;
  }

  .toggle-name {
    font-size: 12px;
    color: var(--ink);
    font-family: inherit;
    user-select: none;
  }

  .sep-dot {
    color: var(--muted);
    font-size: 12px;
    margin: 0 4px;
    user-select: none;
  }

  .keywords-input {
    width: 40px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 1px 4px;
    text-align: center;
    outline: none;
  }
  .keywords-input:focus { border-color: var(--accent); }

  .late-chunk-label {
    position: relative;
  }

  .late-chunk-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--border);
    font-size: 10px;
    color: var(--ink-dim);
    text-decoration: none;
    line-height: 1;
    margin-left: 2px;
    flex-shrink: 0;
    cursor: help;
  }
  .late-chunk-help:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .late-chunk-help:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

</style>
