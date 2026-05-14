<script lang="ts">
  import type { UtilityMeta } from '../../lib/utilities/registry';
  import { runUtility } from '../../lib/utilities/registry';
  import type { UtilityResult } from '../../lib/utilities/types';
  import { utilitiesState, setToolInput } from '../../stores/utilitiesState';
  import type { PiiResult, RedactMode } from '../../lib/utilities/tools/pii-redactor';
  import { SECRET_TYPES } from '../../lib/utilities/tools/pii-redactor';
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

  type DetectorGroup = 'identifier' | 'financial' | 'network' | 'secret' | 'health';
  type DetectorConfig = { type: string; label: string; group: DetectorGroup; enabled: boolean; mode: RedactMode; approximate?: boolean };

  let detectors = $state<DetectorConfig[]>([
    // secrets
    { type: 'pem-private-key',   label: 'PEM Private Key',     group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'aws-secret-key',    label: 'AWS Secret Key',       group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'github-pat',        label: 'GitHub PAT',           group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'slack-token',       label: 'Slack Token',          group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'google-api-key',    label: 'Google API Key',       group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'stripe-key',        label: 'Stripe Key',           group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'twilio-sid',        label: 'Twilio SID',           group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'jwt',               label: 'JWT',                  group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'aws-key',           label: 'AWS Access Key',       group: 'secret',     enabled: true, mode: 'mask' },
    { type: 'api-key',           label: 'API Key',              group: 'secret',     enabled: true, mode: 'mask' },
    // financial
    { type: 'credit-card',       label: 'Credit Card',          group: 'financial',  enabled: true, mode: 'mask' },
    { type: 'iban',              label: 'IBAN',                 group: 'financial',  enabled: true, mode: 'mask' },
    { type: 'ein',               label: 'EIN',                  group: 'financial',  enabled: true, mode: 'mask' },
    { type: 'ethereum-address',  label: 'Ethereum Address',     group: 'financial',  enabled: true, mode: 'mask' },
    { type: 'bitcoin-address',   label: 'Bitcoin Address',      group: 'financial',  enabled: true, mode: 'mask' },
    // network
    { type: 'ipv4',              label: 'IPv4 Address',         group: 'network',    enabled: true, mode: 'mask' },
    { type: 'ipv6',              label: 'IPv6 Address',         group: 'network',    enabled: true, mode: 'mask' },
    { type: 'mac-address',       label: 'MAC Address',          group: 'network',    enabled: true, mode: 'mask' },
    { type: 'url',               label: 'URL',                  group: 'network',    enabled: true, mode: 'mask' },
    // identifiers
    { type: 'email',             label: 'Email',                group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'us-phone',          label: 'US Phone',             group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'intl-phone',        label: 'Intl Phone',           group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'ssn',               label: 'SSN',                  group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'dob',               label: 'Date of Birth',        group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'uuid',              label: 'UUID',                 group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'uk-nino',           label: 'UK NINO',              group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'pan',               label: 'Indian PAN',           group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'aadhaar',           label: 'Aadhaar',              group: 'identifier', enabled: true, mode: 'mask' },
    { type: 'passport',          label: 'Passport (~)',         group: 'identifier', enabled: true, mode: 'mask', approximate: true },
    { type: 'driver-license-us', label: 'US Driver License (~)',group: 'identifier', enabled: true, mode: 'mask', approximate: true },
    // health
    { type: 'medicare-id',       label: 'Medicare ID (~)',      group: 'health',     enabled: true, mode: 'mask', approximate: true },
  ]);

  const GROUPS: { key: DetectorGroup; label: string }[] = [
    { key: 'secret',     label: 'Secrets / API Keys' },
    { key: 'financial',  label: 'Financial' },
    { key: 'network',    label: 'Network' },
    { key: 'identifier', label: 'Personal IDs' },
    { key: 'health',     label: 'Health' },
  ];

  let allEnabled = $derived(detectors.every(d => d.enabled));

  function enableAll() {
    detectors = detectors.map(d => ({ ...d, enabled: true }));
    result = null;
  }

  function disableAll() {
    detectors = detectors.map(d => ({ ...d, enabled: false }));
    result = null;
  }

  function handleInput(e: Event) {
    setToolInput(meta.id, (e.target as HTMLTextAreaElement).value);
    result = null;
  }

  function handleUpload(content: string, _filename: string, _truncated: boolean) {
    setToolInput(meta.id, content);
    result = null;
  }

  async function scan() {
    if (!toolState.primaryInput) return;
    running = true;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: {
        enabledTypes: detectors.filter(d => d.enabled).map(d => d.type),
        redact: false,
      },
    });
    running = false;
  }

  async function redact() {
    if (!toolState.primaryInput) return;
    running = true;
    const modes: Record<string, RedactMode> = {};
    for (const d of detectors) modes[d.type] = d.mode;
    result = await runUtility(meta.id, {
      input: toolState.primaryInput,
      options: {
        enabledTypes: detectors.filter(d => d.enabled).map(d => d.type),
        redact: true,
        modes,
      },
    });
    running = false;
  }

  const TYPE_COLORS: Record<string, string> = {
    // secrets — reds/pinks
    'pem-private-key':   '#b91c1c',
    'aws-secret-key':    '#dc2626',
    'github-pat':        '#e11d48',
    'slack-token':       '#be185d',
    'google-api-key':    '#9f1239',
    'stripe-key':        '#c026d3',
    'twilio-sid':        '#7c3aed',
    'jwt':               '#6d28d9',
    'aws-key':           '#dc2626',
    'api-key':           '#e11d48',
    // financial — ambers/greens
    'credit-card':       '#f59e0b',
    'iban':              '#d97706',
    'ein':               '#b45309',
    'ethereum-address':  '#4f46e5',
    'bitcoin-address':   '#f97316',
    // network — teals/greens
    'ipv4':              '#10b981',
    'ipv6':              '#059669',
    'mac-address':       '#0d9488',
    'url':               '#0ea5e9',
    // identifiers — blues/indigos
    'email':             '#3b82f6',
    'us-phone':          '#8b5cf6',
    'intl-phone':        '#7c3aed',
    'ssn':               '#ef4444',
    'dob':               '#f97316',
    'uuid':              '#64748b',
    'uk-nino':           '#2563eb',
    'pan':               '#1d4ed8',
    'aadhaar':           '#1e40af',
    'passport':          '#3730a3',
    'driver-license-us': '#4338ca',
    // health — rose
    'medicare-id':       '#db2777',
  };

  function colorFor(type: string): string {
    return TYPE_COLORS[type] ?? '#6b7280';
  }

  function labelFor(type: string): string {
    return detectors.find(d => d.type === type)?.label ?? type;
  }

  function hasSecretMatches(d: PiiResult): boolean {
    return Object.keys(d.byType).some(t => SECRET_TYPES.has(t));
  }

  // All detector types for byType display (even zero counts after a scan)
  function allTypeCounts(d: PiiResult): Array<[string, number]> {
    const enabledTypes = detectors.filter(det => det.enabled).map(det => det.type);
    return enabledTypes.map(t => [t, d.byType[t] ?? 0]);
  }
</script>

<div class="input-area">
  <div class="field-label-row">
    <label class="field-label" for="input-{meta.id}">Input Text</label>
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
    placeholder="Paste text containing emails, phone numbers, SSNs, credit cards, API keys…"
    spellcheck="false"
    rows="8"
  ></textarea>
</div>

<div class="detectors-section">
  <div class="detectors-header">
    <span class="field-label" style="margin-bottom:0">Detectors</span>
    <div class="toggle-btns">
      <button class="toggle-all-btn" onclick={enableAll} disabled={allEnabled}>Enable all</button>
      <button class="toggle-all-btn" onclick={disableAll} disabled={!detectors.some(d => d.enabled)}>Disable all</button>
    </div>
  </div>

  {#each GROUPS as grp}
    <details class="detector-group" open>
      <summary class="group-summary">
        <span class="group-label">{grp.label}</span>
        <span class="group-count">{detectors.filter(d => d.group === grp.key && d.enabled).length}/{detectors.filter(d => d.group === grp.key).length}</span>
      </summary>
      <div class="detector-grid">
        {#each detectors.filter(d => d.group === grp.key) as det (det.type)}
          <div class="detector-row" class:disabled={!det.enabled}>
            <label class="detector-check">
              <input
                type="checkbox"
                checked={det.enabled}
                onchange={(e) => {
                  det.enabled = (e.target as HTMLInputElement).checked;
                  result = null;
                }}
              />
              <span class="det-label" style="--dot-color:{colorFor(det.type)}">{det.label}</span>
            </label>
            <select
              class="mode-select"
              disabled={!det.enabled}
              value={det.mode}
              onchange={(e) => {
                det.mode = (e.target as HTMLSelectElement).value as RedactMode;
              }}
              aria-label="Redact mode for {det.label}"
            >
              <option value="mask">Mask</option>
              <option value="hash">Hash</option>
              <option value="strip">Strip</option>
            </select>
          </div>
        {/each}
      </div>
    </details>
  {/each}
</div>

<div class="run-row">
  <button class="run-btn" onclick={scan} disabled={running || !toolState.primaryInput}>
    {running ? 'Scanning…' : 'Scan'}
  </button>
  <button class="redact-btn" onclick={redact} disabled={running || !toolState.primaryInput}>
    {running ? 'Redacting…' : 'Redact All'}
  </button>
</div>

{#if result}
  {#if result.ok && result.data}
    {@const d = result.data as PiiResult}

    {#if d.warning}
      <div class="warn-banner timeout-banner" role="alert">{d.warning}</div>
    {/if}

    {#if hasSecretMatches(d)}
      <div class="warn-banner secret-banner" role="alert">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path d="M8 2L1.5 13h13L8 2Z"/><line x1="8" y1="6" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.6" fill="currentColor" stroke="none"/></svg>Secrets detected — never share or commit these. Redact before exporting.
      </div>
    {/if}

    <div class="result-panel" role="region" aria-label="PII detection results">
      <div class="summary-row">
        <span class="total-pill">{d.matches.length} match{d.matches.length !== 1 ? 'es' : ''}{d.capped ? ' (capped)' : ''}</span>
        {#each allTypeCounts(d) as [type, count]}
          <span
            class="type-pill"
            class:zero-pill={count === 0}
            style="--pill-color:{colorFor(type)}"
          >{labelFor(type)}: {count}</span>
        {/each}
      </div>

      {#if d.matches.length > 0}
        <ul class="match-list" aria-label="PII matches">
          {#each d.matches.slice(0, 200) as m}
            <li class="match-item">
              <span class="match-type" style="--dot-color:{colorFor(m.type)}">{labelFor(m.type)}</span>
              <span class="match-loc">L{m.line}:{m.column}</span>
              <span class="match-value">"{m.value.slice(0, 80)}{m.value.length > 80 ? '…' : ''}"</span>
            </li>
          {/each}
          {#if d.matches.length > 200}
            <li class="match-more">+{d.matches.length - 200} more matches</li>
          {/if}
        </ul>
      {:else}
        <p class="no-matches">No PII detected.</p>
      {/if}

      {#if d.redacted !== undefined}
        <div class="redacted-section">
          <span class="field-label">Redacted Output</span>
          <textarea class="output-box" readonly value={d.redacted} rows="8"></textarea>
          <ResultActions
            text={d.redacted}
            showSendToEditor={true}
            showSendToConvert={true}
            showSendToChunk={true}
            editorFileName="redacted.txt"
            {sendToEditor}
            {sendToConvert}
            {sendToChunk}
          />
        </div>
      {/if}
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

  .detectors-section { display: flex; flex-direction: column; gap: 8px; }
  .detectors-header { display: flex; justify-content: space-between; align-items: center; }
  .toggle-btns { display: flex; gap: 6px; }
  .toggle-all-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 10px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
  }
  .toggle-all-btn:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-dim); }
  .toggle-all-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .detector-group {
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .group-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    cursor: pointer;
    user-select: none;
    background: color-mix(in srgb, var(--surface) 60%, transparent);
    list-style: none;
  }
  .group-summary::-webkit-details-marker { display: none; }
  .group-summary::before {
    content: '▶';
    font-size: 9px;
    color: var(--muted);
    margin-right: 6px;
    transition: transform 0.15s;
  }
  details[open] .group-summary::before { transform: rotate(90deg); }
  .group-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .group-count {
    font-size: 10px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .detector-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 4px;
    padding: 6px 8px 8px;
  }
  .detector-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
  }
  .detector-row.disabled { opacity: 0.45; }
  .detector-check {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }
  .detector-check input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
    accent-color: var(--accent);
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }
  .det-label {
    font-size: 12px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mode-select {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 4px;
    color: var(--ink-dim);
    font-family: inherit;
    font-size: 11px;
    outline: none;
    cursor: pointer;
    flex-shrink: 0;
  }
  .mode-select:focus { border-color: var(--accent); }

  .run-row { display: flex; gap: 8px; }
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
  .redact-btn {
    background: none;
    border: 2px solid var(--accent);
    border-radius: 4px;
    padding: 6px 20px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    transition: background 0.1s, opacity 0.1s;
  }
  .redact-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .redact-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .warn-banner {
    border-radius: 4px;
    padding: 9px 14px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
  }
  .secret-banner {
    background: color-mix(in srgb, #ef4444 14%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 40%, transparent);
    color: #b91c1c;
  }
  :global(.dark) .secret-banner { color: #fca5a5; }
  .timeout-banner {
    background: color-mix(in srgb, #f59e0b 14%, transparent);
    border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
    color: #92400e;
  }
  :global(.dark) .timeout-banner { color: #fde68a; }

  .result-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .summary-row { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
  .total-pill {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 3px;
    padding: 2px 8px;
    font-variant-numeric: tabular-nums;
  }
  .type-pill {
    font-size: 11px;
    color: var(--pill-color, var(--ink-dim));
    background: color-mix(in srgb, var(--pill-color, #6b7280) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--pill-color, #6b7280) 30%, transparent);
    border-radius: 3px;
    padding: 2px 7px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .zero-pill {
    opacity: 0.35;
  }
  .match-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 280px;
    overflow-y: auto;
  }
  .match-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    font-size: 12px;
  }
  .match-type {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--dot-color, var(--muted));
    white-space: nowrap;
    min-width: 100px;
  }
  .match-loc {
    font-size: 10px;
    font-weight: 700;
    color: var(--muted);
    white-space: nowrap;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .match-value {
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    word-break: break-all;
  }
  .match-more { font-size: 12px; color: var(--ink-dim); padding: 4px 6px; font-style: italic; }
  .no-matches { font-size: 13px; color: #22c55e; margin: 0; }
  .redacted-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
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
    min-height: 100px;
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
    .detector-grid { grid-template-columns: 1fr; }
    .run-row { flex-direction: column; }
    .run-btn, .redact-btn { width: 100%; }
    .toggle-btns { flex-direction: column; gap: 4px; }
  }
</style>
