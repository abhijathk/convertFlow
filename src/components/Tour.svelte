<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { shellState, setTab } from '../stores/shellState';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const TOUR_KEY = 'dataprep:tour-seen';

  interface Step {
    tab: 'convert' | 'chunk' | 'editor' | null;
    selector: string | null;
    title: string;
    body: string;
  }

  const steps: Step[] = [
    {
      tab: 'convert',
      selector: '[data-tab="convert"]',
      title: 'Convert tab',
      body: 'Paste or import JSONL training data, validate it, and export to JSONL, CSV, Parquet, and more.',
    },
    {
      tab: 'convert',
      selector: '.format-tabs',
      title: 'Paste or import',
      body: 'Drop a JSONL file onto the editor, or click "import ↓" to parse PDFs, DOCX, and CSV into training pairs.',
    },
    {
      tab: 'convert',
      selector: null,
      title: 'Validation',
      body: 'Errors appear below the editor. Click any error to jump to the offending line.',
    },
    {
      tab: 'convert',
      selector: null,
      title: 'Dataset panel',
      body: 'Manage multiple files — reorder, combine, or set per-file export formats in the right panel.',
    },
    {
      tab: 'chunk',
      selector: '[data-tab="chunk"]',
      title: 'Chunk tab',
      body: 'Split long documents into RAG-ready chunks. Upload a PDF, DOCX, or plain text and choose a strategy.',
    },
    {
      tab: 'editor',
      selector: '[data-tab="editor"]',
      title: 'Editor tab',
      body: 'Full code editor with split-pane preview. Open any file here to hand-edit before export.',
    },
  ];

  let stepIndex = $state(0);
  let highlightRect = $state<DOMRect | null>(null);
  let resizeObserver: ResizeObserver | undefined;
  let tooltipEl = $state<HTMLDivElement | undefined>();
  let tooltipPos = $state<{ top: number; left: number } | null>(null);

  function applyStep(idx: number) {
    const step = steps[idx];
    if (step.tab) setTab(step.tab);
    setTimeout(() => updateHighlight(idx), 80);
  }

  function updateHighlight(idx: number) {
    const step = steps[idx];
    if (step.selector) {
      const el = document.querySelector(step.selector);
      if (el) {
        highlightRect = el.getBoundingClientRect();
        requestAnimationFrame(positionTooltip);
        return;
      }
    }
    highlightRect = null;
    requestAnimationFrame(positionTooltip);
  }

  const MARGIN = 12;
  const GAP = 12;

  function positionTooltip() {
    if (!tooltipEl) return;
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!highlightRect) {
      tooltipPos = {
        top: Math.max(MARGIN, (vh - th) / 2),
        left: Math.max(MARGIN, (vw - tw) / 2),
      };
      return;
    }

    const r = highlightRect;
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;
    const spaceRight = vw - r.right - GAP;
    const spaceLeft = r.left - GAP;

    const clampX = (x: number) => Math.max(MARGIN, Math.min(x, vw - tw - MARGIN));
    const clampY = (y: number) => Math.max(MARGIN, Math.min(y, vh - th - MARGIN));

    if (spaceBelow >= th) {
      tooltipPos = { top: r.bottom + GAP, left: clampX(r.left + r.width / 2 - tw / 2) };
    } else if (spaceAbove >= th) {
      tooltipPos = { top: r.top - GAP - th, left: clampX(r.left + r.width / 2 - tw / 2) };
    } else if (spaceRight >= tw) {
      tooltipPos = { top: clampY(r.top + r.height / 2 - th / 2), left: r.right + GAP };
    } else if (spaceLeft >= tw) {
      tooltipPos = { top: clampY(r.top + r.height / 2 - th / 2), left: r.left - GAP - tw };
    } else {
      tooltipPos = { top: clampY((vh - th) / 2), left: clampX((vw - tw) / 2) };
    }
  }

  function next() {
    if (stepIndex < steps.length - 1) {
      stepIndex += 1;
      applyStep(stepIndex);
    } else {
      finish();
    }
  }

  function prev() {
    if (stepIndex > 0) {
      stepIndex -= 1;
      applyStep(stepIndex);
    }
  }

  function finish() {
    localStorage.setItem(TOUR_KEY, '1');
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') finish();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  }

  onMount(() => {
    applyStep(0);
    resizeObserver = new ResizeObserver(() => updateHighlight(stepIndex));
    resizeObserver.observe(document.body);
    window.addEventListener('scroll', repositionOnScroll, true);
  });

  function repositionOnScroll() {
    updateHighlight(stepIndex);
  }

  onDestroy(() => {
    resizeObserver?.disconnect();
    window.removeEventListener('scroll', repositionOnScroll, true);
  });

  let step = $derived(steps[stepIndex]);
  let isLast = $derived(stepIndex === steps.length - 1);
  let tooltipStyle = $derived(
    tooltipPos
      ? `top: ${tooltipPos.top}px; left: ${tooltipPos.left}px;`
      : 'top: -9999px; left: -9999px;',
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="tour-overlay" aria-modal="true" role="dialog" aria-label="Guided tour">
  {#if highlightRect}
    <div
      class="tour-cutout"
      style="
        top: {highlightRect.top - 4}px;
        left: {highlightRect.left - 4}px;
        width: {highlightRect.width + 8}px;
        height: {highlightRect.height + 8}px;
      "
    ></div>
  {/if}

  <div class="tour-tooltip" bind:this={tooltipEl} style={tooltipStyle}>
    <div class="tour-step-count">{stepIndex + 1} / {steps.length}</div>
    <p class="tour-title">{step.title}</p>
    <p class="tour-body">{step.body}</p>
    <div class="tour-nav">
      <button class="tour-btn tour-skip" onclick={finish}>skip</button>
      <div class="tour-nav-right">
        {#if stepIndex > 0}
          <button class="tour-btn tour-prev" onclick={prev}>prev</button>
        {/if}
        <button class="tour-btn tour-next" onclick={next}>
          {isLast ? 'done' : 'next'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .tour-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.62);
    pointer-events: none;
  }

  .tour-cutout {
    position: fixed;
    border-radius: 3px;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.62);
    background: transparent;
    z-index: 1001;
    pointer-events: none;
    outline: 2px solid var(--accent);
  }

  .tour-tooltip {
    position: fixed;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
    width: 320px;
    max-width: calc(100vw - 24px);
    z-index: 1002;
    pointer-events: all;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }

  .tour-step-count {
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .tour-title {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }

  .tour-body {
    margin: 0 0 14px;
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.55;
  }

  .tour-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tour-nav-right {
    display: flex;
    gap: 6px;
  }

  .tour-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    padding: 3px 10px;
    min-height: 28px;
  }

  .tour-btn:hover { background: var(--border); color: var(--ink); }

  .tour-skip {
    border-color: transparent;
    color: var(--muted);
    padding-left: 0;
  }
  .tour-skip:hover { background: none; color: var(--ink-dim); }

  .tour-next {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .tour-next:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
