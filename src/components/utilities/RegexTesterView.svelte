<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { RegexTesterResult } from '../../lib/utilities/tools/regex-tester';
  import ResultActions from './ResultActions.svelte';
  import FileUploadButton, { TEXT_ACCEPT } from './FileUploadButton.svelte';
  import EditorSelectionButton from './EditorSelectionButton.svelte';

  interface Props {
    meta: UtilityMeta;
    sendToEditor: (name: string, content: string) => void;
    sendToConvert: (content: string) => void;
    sendToChunk: (content: string) => void;
  }

  let { meta, sendToEditor, sendToConvert, sendToChunk }: Props = $props();

  let toolState = $derived($utilitiesState[meta.id] ?? { primaryInput: '', autoPrefilled: false, prefillSourceFileId: null, prefillTruncated: false });
  let result = $state<UtilityResult | null>(null);
  let running = $state(false);

  let pattern = $state('');
  let replacement = $state('');
  let flagG = $state(true);
  let flagI = $state(false);
  let flagM = $state(false);
  let flagS = $state(false);

  let flags = $derived([flagG && 'g', flagI && 'i', flagM && 'm', flagS && 's'].filter(Boolean).join(''));

  async function run() {
    if (!pattern) return;
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: { pattern, flags, replacement: replacement || undefined },
    });
    running = false;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function matchesSummary(d: RegexTesterResult): string {
    return d.matches.map(m => `Line ${m.line}: "${m.value}"`).join('\n');
  }

  function handleUpload(content: string, _filename: string, _truncated: boolean) {
    setToolInput(meta.id, content);
    result = null;
  }
</script>

<div class="pattern-row">
  <div class="pattern-group">
    <label class="field-label" for="pattern-{meta.id}">Pattern</label>
    <input
      id="pattern-{meta.id}"
      type="text"
      class="pattern-input"
      bind:value={pattern}
      oninput={() => (result = null)}
      placeholder="e.g. \b\w+\b"
      spellcheck="false"
      aria-label="Regex pattern"
    />
  </div>
  <div class="flags-group">
    <span class="field-label">Flags</span>
    <div class="flag-toggles">
      {#each ([['g', flagG], ['i', flagI], ['m', flagM], ['s', flagS]] as const) as [f, _val], idx}
        <label class="flag-label" title={{ g: 'Global', i: 'Case insensitive', m: 'Multiline', s: 'Dot-all' }[f]}>
          <input
            type="checkbox"
            checked={[flagG, flagI, flagM, flagS][idx]}
            onchange={(e) => {
              const v = (e.target as HTMLInputElement).checked;
              if (f === 'g') flagG = v;
              else if (f === 'i') flagI = v;
              else if (f === 'm') flagM = v;
              else if (f === 's') flagS = v;
              result = null;
            }}
          />
          {f}
        </label>
      {/each}
    </div>
  </div>
</div>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="test-{meta.id}">Test string</label>
    <div class="action-buttons">
      <FileUploadButton accept={TEXT_ACCEPT} onload={handleUpload} />
      <EditorSelectionButton onload={handleUpload} />
    </div>
  </div>
  <textarea
    id="test-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste or type the text to test against…"
    spellcheck="false"
    rows="8"
  ></textarea>
</div>

<div class="input-area">
  <label class="field-label" for="replace-{meta.id}">Replacement (optional)</label>
  <input
    id="replace-{meta.id}"
    type="text"
    class="pattern-input"
    bind:value={replacement}
    oninput={() => (result = null)}
    placeholder="e.g. $1 or replacement text"
    spellcheck="false"
  />
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running || !pattern}>
    {running ? 'Testing…' : 'Test'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as RegexTesterResult}
    {#if d.patternError}
      <div class="error-panel" role="alert">Invalid pattern: {d.patternError}</div>
    {:else if d.timedOut}
      <div class="error-panel" role="alert">Regex timed out — possible catastrophic backtracking.</div>
    {:else}
      <div class="result-panel" role="region" aria-label="Regex test results">
        <div class="match-header">
          <span class="match-count">{d.count} match{d.count !== 1 ? 'es' : ''}</span>
        </div>
        {#if d.count > 0}
          <ul class="match-list">
            {#each d.matches.slice(0, 50) as m}
              <li class="match-item">
                <span class="match-line">Line {m.line}</span>
                <span class="match-value">"{m.value}"</span>
                {#if Object.keys(m.groups).length > 0}
                  <span class="match-groups">{JSON.stringify(m.groups)}</span>
                {/if}
              </li>
            {/each}
            {#if d.count > 50}
              <li class="match-more">…and {d.count - 50} more</li>
            {/if}
          </ul>
          <ResultActions
            text={matchesSummary(d)}
            showSendToEditor={true}
            showSendToConvert={false}
            showSendToChunk={false}
            editorFileName="matches.txt"
            {sendToEditor}
            {sendToConvert}
            {sendToChunk}
          />
        {/if}
        {#if d.replaced !== undefined}
          <div class="replaced-section">
            <span class="field-label">Replaced output</span>
            <textarea class="output-box" readonly value={d.replaced} rows="6"></textarea>
            <ResultActions
              text={d.replaced}
              showSendToEditor={true}
              showSendToConvert={true}
              showSendToChunk={false}
              editorFileName="replaced.txt"
              {sendToEditor}
              {sendToConvert}
              {sendToChunk}
            />
          </div>
        {/if}
      </div>
    {/if}
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
  .pattern-row { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .pattern-group { flex: 1; min-width: 200px; display: flex; flex-direction: column; }
  .flags-group { display: flex; flex-direction: column; }
  .flag-toggles { display: flex; gap: 8px; }
  .flag-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--ink);
    cursor: pointer;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
  }
  .flag-label:has(input:checked) {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    color: var(--ink);
  }
  .flag-label input { display: none; }
  .pattern-input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 7px 10px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }
  .pattern-input:focus { border-color: var(--accent); }
  .input-area { display: flex; flex-direction: column; }
  .field-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .field-label-row .field-label { margin-bottom: 0; }
  .action-buttons { display: flex; gap: 6px; }
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
    min-height: 120px;
  }
  .primary-input:focus { border-color: var(--accent); }
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
  .result-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .match-header { display: flex; align-items: center; gap: 8px; }
  .match-count { font-size: 13px; font-weight: 700; color: var(--ink); }
  .match-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
  .match-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    padding: 4px 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .match-line { font-weight: 700; color: var(--muted); white-space: nowrap; font-size: 11px; }
  .match-value { color: var(--ink); font-family: var(--font-mono, ui-monospace, monospace); }
  .match-groups { color: var(--ink-dim); font-size: 11px; font-family: var(--font-mono, ui-monospace, monospace); }
  .match-more { font-size: 12px; color: var(--ink-dim); padding: 4px 6px; }
  .replaced-section { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 10px; }
  .output-box {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 12px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    min-height: 80px;
  }
  .error-panel {
    background: color-mix(in srgb, #ef4444 12%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
  }
</style>
