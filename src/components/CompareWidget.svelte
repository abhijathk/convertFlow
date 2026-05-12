<script lang="ts">
  import { approximateTokens } from '../lib/tokenize';
  import { calculateTrainingCost } from '../lib/pricing';
  import presetsJson from '../data/presets.json';

  interface Props {
    presetA: string;
    presetB: string;
  }

  let { presetA, presetB }: Props = $props();

  let text = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pa = presetsJson.find(p => p.id === presetA) ?? presetsJson[0];
  const pb = presetsJson.find(p => p.id === presetB) ?? presetsJson[1];

  interface Result { tokens: number; cost: number }
  let resultA: Result | null = $state(null);
  let resultB: Result | null = $state(null);

  function compute(content: string) {
    if (!content.trim()) { resultA = null; resultB = null; return; }
    const tokens = approximateTokens(content);
    // @ts-expect-error preset type mismatch is safe here
    resultA = { tokens, cost: calculateTrainingCost(tokens, pa) };
    // @ts-expect-error
    resultB = { tokens, cost: calculateTrainingCost(tokens, pb) };
  }

  function handleInput(e: Event) {
    text = (e.target as HTMLTextAreaElement).value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => compute(text), 150);
  }

  function cheaper(): 'a' | 'b' | 'tie' | null {
    if (!resultA || !resultB) return null;
    if (resultA.cost < resultB.cost) return 'a';
    if (resultB.cost < resultA.cost) return 'b';
    return 'tie';
  }
</script>

<div class="compare-widget">
  <div class="editor-wrap">
    <label class="sr-only" for="compare-input">Paste your JSONL dataset</label>
    <textarea
      id="compare-input"
      oninput={handleInput}
      placeholder="// paste your JSONL here"
      rows="6"
      spellcheck="false"
      autocomplete="off"
    ></textarea>
  </div>

  <div class="results" aria-live="polite">
    {#if resultA && resultB}
      {@const win = cheaper()}
      <div class="row" class:winner={win === 'a'}>
        <span class="name">{pa.name}</span>
        <span class="tokens">{resultA.tokens.toLocaleString()}t</span>
        <span class="cost">${resultA.cost.toFixed(4)}</span>
        {#if win === 'a'}<span class="badge">cheaper</span>{/if}
      </div>
      <div class="row" class:winner={win === 'b'}>
        <span class="name">{pb.name}</span>
        <span class="tokens">{resultB.tokens.toLocaleString()}t</span>
        <span class="cost">${resultB.cost.toFixed(4)}</span>
        {#if win === 'b'}<span class="badge">cheaper</span>{/if}
      </div>
      {#if win === 'a' || win === 'b'}
        {@const savings = Math.abs(resultA.cost - resultB.cost)}
        {@const pct = Math.round((savings / Math.max(resultA.cost, resultB.cost)) * 100)}
        <p class="saving">
          {win === 'a' ? pa.name : pb.name} saves ${savings.toFixed(4)} ({pct}%) on this dataset.
        </p>
      {/if}
    {:else}
      <div class="placeholder-rows" aria-hidden="true">
        <div class="row dim"><span class="name">{pa.name}</span><span>—</span><span>—</span></div>
        <div class="row dim"><span class="name">{pb.name}</span><span>—</span><span>—</span></div>
      </div>
    {/if}
  </div>

  <p class="cta">
    <a href="/">Open in full validator →</a>
    <span class="note">validate schema · exact tokens · share link</span>
  </p>
</div>

<style>
  .compare-widget {
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--surface);
    margin: 24px 0;
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0);
    white-space: nowrap; border: 0;
  }

  textarea {
    display: block;
    width: 100%;
    background: var(--surface);
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--ink);
    font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    line-height: 1.6;
    padding: 12px 16px;
    resize: none;
    outline: none;
    box-sizing: border-box;
  }

  textarea::placeholder { color: var(--muted); font-style: italic; }

  .results { padding: 8px 0; }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 16px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .row.winner { background: rgba(224,168,78,0.06); }
  .row.dim { color: var(--ink-dim); }

  .name { flex: 1; color: var(--ink); }
  .tokens { color: var(--ink-dim); font-size: 12px; min-width: 70px; text-align: right; }
  .cost { color: var(--accent); font-weight: 500; min-width: 60px; text-align: right; }

  .badge {
    font-size: 11px;
    color: var(--ok);
    border: 1px solid var(--ok);
    border-radius: 2px;
    padding: 1px 5px;
  }

  .saving {
    margin: 4px 16px 0;
    font-size: 12px;
    color: var(--ok);
  }

  .placeholder-rows .row { opacity: 0.4; }

  .cta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    flex-wrap: wrap;
  }

  .cta a { color: var(--accent); text-decoration: none; }
  .cta a:hover { text-decoration: underline; }
  .note { color: var(--ink-dim); }
</style>
