<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    status: 'uploading' | 'parsing';
    progress: number;
    sourceCharCount: number;
  }

  let { status, progress, sourceCharCount }: Props = $props();

  const PHRASES: Record<string, string[]> = {
    uploading: [
      'Buffering file bytes…',
      'Measuring document size…',
      'Preparing extraction…',
    ],
    parsing: [
      'Dissolving markup…',
      'Extracting raw prose…',
      'Decoding document structure…',
      'Unwrapping paragraphs…',
      'Stripping formatting artifacts…',
      'Recovering plain text…',
    ],
    chunking: [
      'Tracing semantic boundaries…',
      'Measuring sentence topology…',
      'Sliding the context window…',
      'Weighing paragraph density…',
      'Finding natural break points…',
      'Mapping topic transitions…',
      'Carving chunk boundaries…',
    ],
    enriching: [
      'Hashing chunk fingerprints…',
      'Distilling key terms…',
      'Scoring information density…',
      'Computing term frequency…',
      'Fingerprinting content…',
    ],
  };

  function phaseFromProgress(p: number, s: string): string {
    if (s === 'uploading') return 'uploading';
    if (p < 30) return 'parsing';
    if (p < 75) return 'chunking';
    return 'enriching';
  }

  function statusLabel(p: number): string {
    if (p < 20) return 'reading';
    if (p < 50) return 'chunking';
    if (p < 80) return 'enriching';
    if (p < 95) return 'almost done';
    return 'finishing up';
  }

  let elapsed = $state(0);
  let phraseIndex = $state(0);
  let visible = $state(true); // for crossfade

  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let phraseTimer: ReturnType<typeof setInterval> | undefined;

  let phase = $derived(phaseFromProgress(progress, status));
  let phrases = $derived(PHRASES[phase] ?? PHRASES.chunking);
  let phrase = $derived(phrases[phraseIndex % phrases.length]);
  let approxTokens = $derived(Math.ceil(sourceCharCount / 4));

  function fmtElapsed(ms: number): string {
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    return `${m}m ${rem}s`;
  }

  function fmtTokens(n: number): string {
    if (n === 0) return '';
    if (n >= 1000) return `↓ ~${(n / 1000).toFixed(1)}k tokens`;
    return `↓ ~${n} tokens`;
  }

  onMount(() => {
    clockTimer = setInterval(() => { elapsed += 100; }, 100);

    phraseTimer = setInterval(() => {
      visible = false;
      setTimeout(() => {
        phraseIndex += 1;
        visible = true;
      }, 150);
    }, 1800);
  });

  onDestroy(() => {
    clearInterval(clockTimer);
    clearInterval(phraseTimer);
  });
</script>

<div class="loader" role="status" aria-live="polite" aria-label="Processing document">
  <div class="line">
    <span class="glyph" aria-hidden="true">✽</span>
    <span class="phrase" class:fade={!visible}>{phrase}</span>
  </div>
  <div class="stats" aria-label="Progress details">
    <span class="stat-time">{fmtElapsed(elapsed)}</span>
    {#if approxTokens > 0}
      <span class="sep" aria-hidden="true">·</span>
      <span class="stat-tokens">{fmtTokens(approxTokens)}</span>
    {/if}
    <span class="sep" aria-hidden="true">·</span>
    <span class="stat-status">{statusLabel(progress)}</span>
  </div>
</div>

<style>
  .loader {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 20px 18px;
    font-size: 13px;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .glyph {
    color: var(--accent);
    font-size: 14px;
    animation: spin 3s linear infinite;
    display: inline-block;
    flex-shrink: 0;
  }

  .phrase {
    color: var(--ink);
    transition: opacity 0.15s ease;
  }

  .phrase.fade { opacity: 0; }

  .stats {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 23px;
    font-size: 12px;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
  }

  .sep { color: var(--muted); }
  .stat-tokens { color: var(--accent); opacity: 0.8; }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .glyph { animation: none; }
    .phrase { transition: none; }
  }
</style>
