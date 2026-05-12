<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { HashResult, HashAlgorithm } from '../../lib/utilities/tools/hash-tools';
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
  let algorithm = $state<HashAlgorithm>('SHA-256');

  const ALGORITHMS: HashAlgorithm[] = ['SHA-256', 'SHA-512', 'SHA-1'];

  async function run() {
    running = true;
    result = await runUtility(meta.id, { input: toolState.primaryInput, options: { algorithm } });
    running = false;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function handleUpload(content: string, _filename: string, _truncated: boolean) {
    setToolInput(meta.id, content);
    result = null;
  }

  let binaryFile = $state<{ name: string; hex: string; algo: string } | null>(null);
  let binaryRunning = $state(false);

  async function handleBinaryUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    binaryRunning = true;
    binaryFile = null;
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest(algorithm, buf);
    const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    binaryFile = { name: file.name, hex, algo: algorithm };
    binaryRunning = false;
    (e.target as HTMLInputElement).value = '';
  }
</script>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">Input</label>
    <div class="action-buttons">
      <FileUploadButton accept={TEXT_ACCEPT} onload={handleUpload} />
      <EditorSelectionButton onload={handleUpload} />
    </div>
  </div>
  <textarea
    id="input-{meta.id}"
    class="primary-input"
    value={toolState.primaryInput}
    oninput={handleInput}
    placeholder="Paste or type text to hash…"
    spellcheck="false"
    rows="6"
  ></textarea>
</div>

<div class="settings-row">
  <div class="setting-group">
    <span class="field-label">Algorithm</span>
    <div class="algo-group">
      {#each ALGORITHMS as algo}
        <label class="algo-label">
          <input
            type="radio"
            name="algo-{meta.id}"
            value={algo}
            bind:group={algorithm}
            onchange={() => (result = null)}
          />
          {algo}
        </label>
      {/each}
      <span class="algo-note">MD5 not available in WebCrypto — use SHA-1 for legacy support</span>
    </div>
  </div>
</div>

<div class="run-row">
  <button class="run-btn" onclick={run} disabled={running}>
    {running ? 'Hashing…' : 'Generate Hash'}
  </button>
</div>

<div class="binary-row">
  <span class="field-label" style="margin-bottom:0">Hash a file (binary)</span>
  <label class="upload-btn" aria-busy={binaryRunning}>
    {binaryRunning ? 'Hashing…' : '↑ Choose file'}
    <input type="file" accept="*" class="hidden-input" onchange={handleBinaryUpload} disabled={binaryRunning} />
  </label>
</div>

{#if binaryFile}
  <div class="result-panel binary-result" role="region" aria-label="Binary hash result">
    <div class="algo-badge">{binaryFile.algo} · {binaryFile.name}</div>
    <div class="hex-display">{binaryFile.hex}</div>
  </div>
{/if}

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as HashResult}
    <div class="result-panel" role="region" aria-label="Hash result">
      <div class="algo-badge">{d.algorithm} · {d.length / 2} bytes</div>
      <div class="hex-display">{d.hex}</div>
      <ResultActions
        text={d.hex}
        showSendToEditor={false}
        showSendToConvert={false}
        showSendToChunk={false}
        {sendToEditor}
        {sendToConvert}
        {sendToChunk}
      />
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
  .field-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .field-label-row .field-label { margin-bottom: 0; }
  .action-buttons { display: flex; gap: 6px; }
  .binary-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .upload-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    white-space: nowrap;
    transition: color 0.1s, border-color 0.1s;
  }
  .upload-btn:hover { color: var(--ink); border-color: var(--ink-dim); }
  .hidden-input { display: none; }
  .binary-result { margin-top: 0; }
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
  .settings-row { display: flex; }
  .setting-group { display: flex; flex-direction: column; gap: 6px; }
  .algo-group { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .algo-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--ink);
    cursor: pointer;
  }
  .algo-label input { cursor: pointer; accent-color: var(--accent); }
  .algo-note {
    font-size: 11px;
    color: var(--ink-dim);
    font-style: italic;
    margin-left: 4px;
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
  .result-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .algo-badge {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .hex-display {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 13px;
    color: var(--ink);
    word-break: break-all;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 12px;
    line-height: 1.6;
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
