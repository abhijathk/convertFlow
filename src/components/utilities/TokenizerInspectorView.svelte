<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { TokenizerInspectorResult } from '../../lib/utilities/tools/tokenizer-inspector';
  import type { TokenizerId } from '../../lib/multi-tokenizer';

  interface Props {
    meta: UtilityMeta;
    sendToEditor: (name: string, content: string) => void;
    sendToConvert: (content: string) => void;
    sendToChunk: (content: string) => void;
  }

  let { meta }: Props = $props();

  let toolState = $derived(
    $utilitiesState[meta.id] ?? { primaryInput: '', autoPrefilled: false, prefillSourceFileId: null, prefillTruncated: false }
  );
  let result = $state<UtilityResult | null>(null);
  let running = $state(false);

  interface TokenizerConfig {
    id: TokenizerId;
    label: string;
    hint: string;
    requiresDownload: boolean;
    enabled: boolean;
  }

  let tokenizers = $state<TokenizerConfig[]>([
    { id: 'cl100k_base', label: 'cl100k',   hint: 'GPT-3.5 / GPT-4',  requiresDownload: false, enabled: true },
    { id: 'o200k_base',  label: 'o200k',    hint: 'GPT-4o',            requiresDownload: false, enabled: true },
    { id: 'p50k_base',   label: 'p50k',     hint: 'Codex / text-davinci', requiresDownload: false, enabled: false },
    { id: 'r50k_base',   label: 'r50k',     hint: 'GPT-3 legacy',      requiresDownload: false, enabled: false },
    { id: 'llama3',      label: 'Llama-3',  hint: 'Meta Llama-3 (~2 MB)', requiresDownload: true,  enabled: false },
    { id: 'mistral',     label: 'Mistral',  hint: 'Mistral v3 (~2 MB)', requiresDownload: true,  enabled: false },
    { id: 'gemma',       label: 'Gemma',    hint: 'Google Gemma (~2 MB)', requiresDownload: true,  enabled: false },
  ]);

  // Per-tokenizer download progress: { loaded, total }
  let progress = $state<Partial<Record<TokenizerId, { loaded: number; total: number }>>>({});

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function toggleTokenizer(id: TokenizerId, checked: boolean) {
    const t = tokenizers.find(t => t.id === id);
    if (t) t.enabled = checked;
    result = null;
  }

  async function run() {
    if (!toolState.primaryInput) return;
    running = true;
    result = null;
    progress = {};

    const enabled = tokenizers.filter(t => t.enabled).map(t => t.id);

    const onProgress = (tokenizerId: TokenizerId, loaded: number, total: number) => {
      progress = { ...progress, [tokenizerId]: { loaded, total } };
    };

    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { enabled, onProgress },
    });
    running = false;
    progress = {};
  }

  /** Golden-angle HSL colour for token chip at index `idx` */
  function tokenColor(idx: number): string {
    const hue = (idx * 137) % 360;
    return `hsl(${hue}, 55%, 50%)`;
  }

  function labelFor(id: TokenizerId): string {
    return tokenizers.find(t => t.id === id)?.label ?? id;
  }

  function progressPct(id: TokenizerId): number {
    const p = progress[id];
    if (!p || p.total === 0) return 0;
    return Math.min(100, (p.loaded / p.total) * 100);
  }

  function isDownloading(id: TokenizerId): boolean {
    const p = progress[id];
    return !!p && p.loaded < p.total;
  }
</script>

<div class="input-area">
  <label class="field-label" for="input-{meta.id}">Input Text</label>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste any text to compare tokenizations across models…"
    spellcheck="false"
    rows="6"
  ></textarea>
</div>

<div class="tokenizer-grid" role="group" aria-label="Tokenizer selection">
  <span class="field-label" style="grid-column:1/-1">Tokenizers</span>
  {#each tokenizers as t (t.id)}
    <label class="tok-card" class:tok-enabled={t.enabled}>
      <input
        type="checkbox"
        checked={t.enabled}
        onchange={(e) => toggleTokenizer(t.id, (e.target as HTMLInputElement).checked)}
      />
      <span class="tok-name">{t.label}</span>
      <span class="tok-hint">{t.hint}</span>
    </label>
  {/each}
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !toolState.primaryInput}>
    {running ? 'Tokenizing…' : 'Inspect'}
  </button>
</div>

{#if running && Object.keys(progress).length > 0}
  <div class="download-banners" aria-live="polite">
    {#each tokenizers.filter(t => t.enabled && t.requiresDownload) as t (t.id)}
      {#if isDownloading(t.id)}
        <div class="download-banner">
          <span class="dl-label">Downloading {t.label} tokenizer…</span>
          <div class="dl-bar">
            <div class="dl-fill" style="width:{progressPct(t.id).toFixed(1)}%"></div>
          </div>
          <span class="dl-pct">{progressPct(t.id).toFixed(0)}%</span>
        </div>
      {/if}
    {/each}
  </div>
{/if}

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as TokenizerInspectorResult}
    <div class="result-panel" role="region" aria-label="Tokenizer comparison results">

      <!-- Summary counts row -->
      <div class="counts-row">
        {#each tokenizers.filter(t => t.enabled) as t (t.id)}
          {#if d.perTokenizer[t.id] !== undefined}
            {@const pr = d.perTokenizer[t.id]!}
            <div class="count-card">
              <span class="count-label">{t.label}</span>
              <span class="count-value" class:count-error={pr.count < 0}>
                {pr.count < 0 ? 'error' : pr.count.toLocaleString()}
              </span>
              <span class="count-sub">tokens</span>
            </div>
          {/if}
        {/each}
      </div>

      <!-- Per-tokenizer token chip rows -->
      {#each tokenizers.filter(t => t.enabled) as t (t.id)}
        {#if d.perTokenizer[t.id] !== undefined}
          {@const pr = d.perTokenizer[t.id]!}
          <div class="tok-row">
            <div class="tok-row-header">
              <span class="tok-row-label">{labelFor(t.id)}</span>
              {#if pr.count >= 0}
                <span class="tok-row-count">{pr.count} tokens</span>
              {:else}
                <span class="tok-row-err">failed to load</span>
              {/if}
            </div>
            {#if pr.count > 0}
              <div class="chip-strip" role="list" aria-label="{labelFor(t.id)} token chips">
                {#each pr.tokens.slice(0, 256) as tok, i}
                  <span
                    class="chip"
                    role="listitem"
                    style="--chip-color:{tokenColor(i)}"
                    title="id:{tok.id}"
                  >{tok.text || ' '}</span>
                {/each}
                {#if pr.tokens.length > 256}
                  <span class="chip-more">+{pr.tokens.length - 256} more</span>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/each}

    </div>
  {:else if !result.ok}
    <div class="error-panel" role="alert">{result.error ?? 'An error occurred.'}</div>
  {/if}
{/if}

<style>
  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }

  .input-area { display: flex; flex-direction: column; }
  .primary-input {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 12px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    min-height: 100px;
  }
  .primary-input:focus { border-color: var(--accent); }

  .tokenizer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }

  .tok-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    cursor: pointer;
    transition: border-color 0.1s;
  }
  .tok-card:hover { border-color: var(--accent); }
  .tok-enabled { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }

  .tok-card input[type="checkbox"] {
    margin: 0 0 4px 0;
    accent-color: var(--accent);
    width: 13px;
    height: 13px;
    cursor: pointer;
  }

  .tok-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
  }
  .tok-hint {
    font-size: 10px;
    color: var(--muted);
    line-height: 1.3;
  }

  .run-row { display: flex; }
  .run-btn {
    background: var(--accent);
    border: none;
    border-radius: 4px;
    padding: 7px 20px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    transition: opacity 0.1s;
  }
  .run-btn:hover:not(:disabled) { opacity: 0.85; }
  .run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .download-banners {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .download-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-radius: 4px;
    padding: 8px 12px;
  }
  .dl-label { font-size: 11px; color: var(--ink-dim); white-space: nowrap; }
  .dl-bar {
    flex: 1;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .dl-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.3s;
  }
  .dl-pct {
    font-size: 11px;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
    min-width: 28px;
  }

  .result-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
  }

  .counts-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .count-card {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 12px;
    min-width: 72px;
  }
  .count-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .count-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .count-error { color: var(--err); font-size: 13px; }
  .count-sub {
    font-size: 10px;
    color: var(--ink-dim);
  }

  .tok-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .tok-row:first-of-type { border-top: none; padding-top: 0; }

  .tok-row-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tok-row-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    min-width: 64px;
  }
  .tok-row-count {
    font-size: 11px;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
  }
  .tok-row-err {
    font-size: 11px;
    color: var(--err);
  }

  .chip-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    max-height: 120px;
    overflow-y: auto;
  }

  .chip {
    display: inline-block;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--chip-color) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--chip-color) 40%, transparent);
    color: var(--chip-color);
    white-space: pre;
    cursor: default;
    user-select: text;
    line-height: 1.5;
  }
  .chip-more {
    font-size: 11px;
    color: var(--muted);
    padding: 1px 4px;
    align-self: center;
    font-style: italic;
  }

  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }

  @media (max-width: 480px) {
    .tokenizer-grid { grid-template-columns: repeat(2, 1fr); }
    .counts-row { gap: 6px; }
  }
</style>
