<script lang="ts">
  import { convertState } from '../stores/convertState';
  import type { ExportFormat } from '../stores/convertState';
  import presetsJson from '../data/presets.json';
  import { setToolInput, selectedUtilityId } from '../stores/utilitiesState';
  import { setTab } from '../stores/shellState';

  function openInUtilities() {
    const content = $convertState.editorContent ?? '';
    if (content) {
      setToolInput('json-validator', content);
      setToolInput('token-analyzer', content);
      setToolInput('token-estimator', content);
      setToolInput('duplicate-detector', content);
    }
    selectedUtilityId.set('json-validator');
    setTab('utilities');
  }

  interface Props {
    oncopy?: () => void;
    ondownload?: () => void;
    ondownloadzip?: () => void;
    onopeneditor?: () => void;
    datasetFileCount?: number;
    onpresetchange?: (presetId: string) => void;
    copyFeedback?: string;
    onimporttoggle?: () => void;
    onformatchange?: (id: ExportFormat) => void;
    onhfpush?: () => void;
    onstatstoggle?: () => void;
    statsOpen?: boolean;
  }

  let { oncopy, ondownload, ondownloadzip, onopeneditor, datasetFileCount = 0, onpresetchange, copyFeedback = '', onimporttoggle, onformatchange, onhfpush, onstatstoggle, statsOpen = false }: Props = $props();


  // ── Format tab definitions ────────────────────────────────────────────────

  interface FormatDef {
    id: ExportFormat;
    label: string;
    title: string;
  }

  const formats: FormatDef[] = [
    { id: 'jsonl',    label: 'JSONL',      title: 'One JSON object per line — OpenAI fine-tuning format' },
    { id: 'json',     label: 'JSON',       title: 'Pretty-printed JSON array' },
    { id: 'csv',      label: 'CSV',        title: 'Flat CSV — one row per message, opens in Excel' },
    { id: 'tsv',      label: 'TSV',        title: 'Tab-separated values — universal tabular format' },
    { id: 'parquet',  label: 'Parquet',    title: 'Apache Parquet — HuggingFace datasets compatible' },
    { id: 'md',       label: 'Markdown',   title: 'Conversations formatted as readable Markdown' },
    { id: 'txt',      label: 'TXT',        title: 'Plain text — message content only, no JSON structure' },
    { id: 'alpaca',   label: 'Alpaca',     title: 'Alpaca JSONL — instruction/input/output format' },
    { id: 'sharegpt', label: 'ShareGPT',   title: 'ShareGPT JSONL — conversations [{from, value}] format' },
  ];

  // ── Derived state ─────────────────────────────────────────────────────────

  let fmt = $derived($convertState.exportFormat);
  let hasContent = $derived($convertState.lineCount > 0);
  let isBinary = $derived(fmt === 'parquet');
  let presetLocked = $derived(hasContent && !$convertState.presetUnlocked);
  let confirmingUnlock = $state(false);
  let autoLockSecondsLeft = $state(0);

  const AUTO_LOCK_SECONDS = 30;
  let autoLockInterval: ReturnType<typeof setInterval> | undefined;

  function clearAutoLockTimer() {
    if (autoLockInterval) { clearInterval(autoLockInterval); autoLockInterval = undefined; }
    autoLockSecondsLeft = 0;
  }

  function startAutoLockTimer() {
    clearAutoLockTimer();
    autoLockSecondsLeft = AUTO_LOCK_SECONDS;
    autoLockInterval = setInterval(() => {
      autoLockSecondsLeft -= 1;
      if (autoLockSecondsLeft <= 0) {
        clearAutoLockTimer();
        // Auto-lock back to the model that generated the current output.
        // Bumping presetSelectVersion forces the dropdown to repaint with
        // convertState.presetId (the source of truth), discarding any
        // in-flight selection the user made but didn't confirm.
        convertState.update(s => ({
          ...s,
          presetUnlocked: false,
          presetSelectVersion: s.presetSelectVersion + 1,
        }));
      }
    }, 1000);
  }

  // Auto-lock after 30s while unlocked. Clears if the user manually locks,
  // the dataset is cleared, or the section is already locked.
  $effect(() => {
    if ($convertState.presetUnlocked && hasContent) {
      startAutoLockTimer();
    } else {
      clearAutoLockTimer();
    }
    return () => clearAutoLockTimer();
  });

  function requestUnlockOrLock() {
    if (presetLocked) {
      confirmingUnlock = true;
    } else {
      // Re-lock instantly; no confirmation needed for re-locking.
      convertState.update(s => ({ ...s, presetUnlocked: false }));
    }
  }

  function confirmUnlock() {
    convertState.update(s => ({ ...s, presetUnlocked: true }));
    confirmingUnlock = false;
  }

  function cancelUnlock() {
    confirmingUnlock = false;
  }

  function pick(id: ExportFormat, e: MouseEvent) {
    (e.currentTarget as HTMLElement).blur();
    if (onformatchange) {
      onformatchange(id);
    } else {
      convertState.update(s => ({ ...s, exportFormat: id }));
    }
  }

  // ── Preset picker (inline, same logic as ConvertPresetBar) ─────────────────

  let dropdownOpen = $state(false);
  let dropdownEl: HTMLDivElement | undefined = $state();

  let preset = $derived(presetsJson.find(p => p.id === $convertState.presetId) ?? presetsJson[0]);
  let daysSinceVerified = $derived(
    preset ? Math.floor((Date.now() - new Date(preset.lastVerified).getTime()) / 86400000) : 0
  );
  let isStale = $derived(daysSinceVerified > 60);

  const providers = [...new Set(presetsJson.map(p => p.provider))];
  function presetsForProvider(provider: string) {
    return presetsJson.filter(p => p.provider === provider);
  }

  let selectedProvider = $derived(preset?.provider ?? providers[0]);
  let modelsForSelected = $derived(presetsForProvider(selectedProvider));

  function selectPreset(id: string) {
    convertState.update(s => ({ ...s, presetId: id }));
    onpresetchange?.(id);
    dropdownOpen = false;
  }

  function onProviderChange(provider: string) {
    const first = presetsForProvider(provider)[0];
    if (first) selectPreset(first.id);
  }

  function toggleDropdown(e: MouseEvent) {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dropdownOpen = false;
  }

  function handleOutsideClick(e: MouseEvent) {
    if (dropdownEl && !dropdownEl.contains(e.target as Node)) {
      dropdownOpen = false;
    }
  }

  // ── Format settings ───────────────────────────────────────────────────────

  let settings = $derived($convertState.formatSettings);

  function updateSetting<K extends keyof typeof $convertState.formatSettings>(
    format: K,
    key: string,
    value: unknown
  ) {
    convertState.update(s => ({
      ...s,
      formatSettings: {
        ...s.formatSettings,
        [format]: { ...s.formatSettings[format], [key]: value },
      },
    }));
  }

  // ── Row 2 info content per format ─────────────────────────────────────────

  // For JSONL: show preset note derived from preset data
  let presetFormatNote = $derived(() => {
    if (!preset) return '';
    const fmt = preset.format;
    if (fmt === 'chatml') return 'ChatML messages[]';
    if (fmt === 'harmony') return 'Harmony messages[]';
    if (fmt === 'alpaca') return 'Alpaca instruction/output';
    return fmt;
  });
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleOutsideClick} />

<!-- Row 1: Format tabs + copy/download actions -->
<div class="toolbar-row toolbar-tabs">
  <div class="format-tabs" role="tablist" aria-label="Export format">
    {#each formats as f}
      <button
        role="tab"
        aria-selected={fmt === f.id}
        class:active={fmt === f.id}
        onclick={(e) => pick(f.id, e)}
        title={f.title}
      >{f.label}</button>
    {/each}
  </div>

  <div class="actions">
    <button class="import-btn" onclick={onimporttoggle} title="Import files — single, multiple, or a folder">import ↓</button>
    <button onclick={onopeneditor} disabled={!hasContent} class="editor-btn" title="Edit current content in Editor tab (⌘3)">↗ Editor</button>
    <button onclick={openInUtilities} disabled={!$convertState.editorContent?.trim()} class="utilities-btn" title="Analyze content in Utilities tab">↗ Utilities</button>
    {#if !isBinary}
      <button
        onclick={oncopy}
        disabled={!hasContent}
        class:ok={!!copyFeedback}
        title="Copy to clipboard"
      >{copyFeedback ? '✓ copied' : 'copy'}</button>
    {/if}
    {#if datasetFileCount > 1}
      <button onclick={ondownload} disabled={!hasContent} title="Download combined file">combined ↑</button>
      <button onclick={ondownloadzip} disabled={!hasContent} title="Download individual files as zip">zip ↑</button>
    {:else}
      <button onclick={ondownload} disabled={!hasContent} title="Download file">download ↑</button>
    {/if}
  </div>
</div>

<!-- Row 2: Dynamic settings/info zone per format -->
<div class="toolbar-row toolbar-info">
  {#if fmt === 'jsonl'}
    <div class="info-left">
      <span class="dot" aria-hidden="true">●</span>
      {#key $convertState.presetSelectVersion}
        <select
          class="setting-select preset-provider"
          class:locked={presetLocked}
          value={selectedProvider}
          onchange={(e) => onProviderChange(e.currentTarget.value)}
          aria-label="Select provider"
          disabled={presetLocked}
          title={presetLocked ? 'Locked — click the lock icon to unlock' : 'Select provider'}
        >
          {#each providers as provider (provider)}
            <option value={provider}>{provider}</option>
          {/each}
        </select>
        <select
          class="setting-select preset-model"
          class:locked={presetLocked}
          value={$convertState.presetId}
          onchange={(e) => selectPreset(e.currentTarget.value)}
          aria-label="Select model"
          disabled={presetLocked}
          title={presetLocked ? 'Locked — click the lock icon to unlock' : 'Select model'}
        >
          {#each modelsForSelected as p (p.id)}
            <option value={p.id}>{p.name} — ${p.pricing.trainingPerMTokens}/M train</option>
          {/each}
        </select>
      {/key}
      {#if hasContent}
        <button
          type="button"
          class="lock-btn"
          class:locked={presetLocked}
          class:unlocked={!presetLocked}
          onclick={requestUnlockOrLock}
          title={presetLocked ? 'Locked — click to unlock provider/model (with confirmation)' : `Unlocked — auto-locks in ${autoLockSecondsLeft}s. Click to re-lock now.`}
          aria-label={presetLocked ? 'Unlock provider and model' : 'Re-lock provider and model'}
        >
          {#if presetLocked}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1"/>
              <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
            </svg>
          {:else}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1"/>
              <path d="M5 7V5a3 3 0 0 1 5.4-1.8"/>
            </svg>
          {/if}
        </button>
        {#if !presetLocked && autoLockSecondsLeft > 0}
          <span class="lock-countdown" title="Auto-locks after 30 seconds of inactivity">{autoLockSecondsLeft}s</span>
        {/if}
      {/if}
    </div>
    <span class="info-sep">·</span>
    <span class="info-text">{presetFormatNote()}</span>
    {#if isStale}
      <span class="info-sep">·</span>
      <span class="warn" title="Pricing may have changed — verify before relying on cost estimates">⚠ verify</span>
    {/if}

  {:else if fmt === 'json'}
    <span class="info-text dim">indent:</span>
    <select class="setting-select" value={settings.json.indent} onchange={e => updateSetting('json', 'indent', Number(e.currentTarget.value))}>
      <option value={2}>2 spaces</option>
      <option value={4}>4 spaces</option>
      <option value={0}>minified</option>
    </select>

  {:else if fmt === 'csv'}
    <select class="setting-select" value={settings.csv.delimiter} onchange={e => updateSetting('csv', 'delimiter', e.currentTarget.value)}>
      <option value=",">comma</option>
      <option value={'\t'}>tab</option>
      <option value="|">pipe</option>
      <option value=";">semicolon</option>
    </select>
    <span class="info-sep">·</span>
    <label class="inline-toggle">
      <input type="checkbox" checked={settings.csv.header} onchange={e => updateSetting('csv', 'header', e.currentTarget.checked)} />
      <span>header row</span>
    </label>

  {:else if fmt === 'tsv'}
    <select class="setting-select" value={settings.tsv.delimiter} onchange={e => updateSetting('tsv', 'delimiter', e.currentTarget.value)}>
      <option value={'\t'}>tab</option>
      <option value=",">comma</option>
      <option value="|">pipe</option>
      <option value=";">semicolon</option>
    </select>
    <span class="info-sep">·</span>
    <label class="inline-toggle">
      <input type="checkbox" checked={settings.tsv.header} onchange={e => updateSetting('tsv', 'header', e.currentTarget.checked)} />
      <span>header row</span>
    </label>

  {:else if fmt === 'parquet'}
    <span class="info-text dim">compression:</span>
    <select class="setting-select" value={settings.parquet.compression} onchange={e => updateSetting('parquet', 'compression', e.currentTarget.value)}>
      <option value="snappy">snappy</option>
      <option value="gzip">gzip</option>
      <option value="uncompressed">none</option>
    </select>
    <span class="info-sep">·</span>
    <span class="info-text dim">HuggingFace compatible</span>

  {:else if fmt === 'md'}
    <select class="setting-select" value={settings.md.headingLevel} onchange={e => updateSetting('md', 'headingLevel', Number(e.currentTarget.value))}>
      <option value={2}>## heading</option>
      <option value={3}>### heading</option>
    </select>
    <span class="info-sep">·</span>
    <select class="setting-select" value={settings.md.separator} onchange={e => updateSetting('md', 'separator', e.currentTarget.value)}>
      <option value="---">--- separator</option>
      <option value="===">=== separator</option>
    </select>

  {:else if fmt === 'txt'}
    <span class="info-text dim">role prefix:</span>
    <select class="setting-select" value={settings.txt.rolePrefix} onchange={e => updateSetting('txt', 'rolePrefix', e.currentTarget.value)}>
      <option value="bracket">[ROLE]</option>
      <option value="colon">Role:</option>
      <option value="upper">ROLE:</option>
    </select>

  {:else if fmt === 'alpaca'}
    <span class="info-text dim">system:</span>
    <select class="setting-select" value={settings.alpaca.systemAs} onchange={e => updateSetting('alpaca', 'systemAs', e.currentTarget.value)}>
      <option value="input">as input</option>
      <option value="ignore">ignore</option>
    </select>
    <span class="info-sep">·</span>
    <label class="inline-toggle">
      <input type="checkbox" checked={settings.alpaca.splitMultiTurn} onchange={e => updateSetting('alpaca', 'splitMultiTurn', e.currentTarget.checked)} />
      <span>split multi-turn</span>
    </label>

  {:else if fmt === 'sharegpt'}
    <span class="info-text dim">roles:</span>
    <select
      class="setting-select"
      value={`${settings.sharegpt.roleHuman}+${settings.sharegpt.roleAssistant}`}
      onchange={e => {
        const [h, a] = e.currentTarget.value.split('+');
        updateSetting('sharegpt', 'roleHuman', h);
        updateSetting('sharegpt', 'roleAssistant', a);
      }}
    >
      <option value="human+gpt">human + gpt</option>
      <option value="user+assistant">user + assistant</option>
    </select>
    <span class="info-sep">·</span>
    <label class="inline-toggle">
      <input type="checkbox" checked={settings.sharegpt.includeSystem} onchange={e => updateSetting('sharegpt', 'includeSystem', e.currentTarget.checked)} />
      <span>system turns</span>
    </label>
  {/if}
</div>

<!-- Row 3: JSONL conversation settings (role rename, filter, system prompt) -->
{#if fmt === 'jsonl'}
<div class="toolbar-row toolbar-jsonl-settings">
  <span class="info-text dim">user →</span>
  <input
    class="role-input"
    type="text"
    value={settings.jsonl.roleUser}
    placeholder="user"
    aria-label="User role name"
    oninput={e => updateSetting('jsonl', 'roleUser', e.currentTarget.value || 'user')}
  />
  <span class="info-sep">·</span>
  <span class="info-text dim">assistant →</span>
  <input
    class="role-input"
    type="text"
    value={settings.jsonl.roleAssistant}
    placeholder="assistant"
    aria-label="Assistant role name"
    oninput={e => updateSetting('jsonl', 'roleAssistant', e.currentTarget.value || 'assistant')}
  />
  <span class="info-sep">·</span>
  <label class="inline-toggle">
    <input type="checkbox" checked={settings.jsonl.filterIncomplete} onchange={e => updateSetting('jsonl', 'filterIncomplete', e.currentTarget.checked)} />
    <span>filter incomplete</span>
  </label>
  <span class="info-sep">·</span>
  <span class="info-text dim">sys:</span>
  <input
    class="sys-input"
    type="text"
    value={settings.jsonl.systemPrompt}
    placeholder="inject into examples without a system message"
    aria-label="Default system prompt"
    oninput={e => updateSetting('jsonl', 'systemPrompt', e.currentTarget.value)}
  />
</div>
{/if}

{#if confirmingUnlock}
  <div class="unlock-overlay" role="dialog" aria-modal="true" aria-labelledby="unlock-dialog-title">
    <div class="unlock-box">
      <p class="unlock-title" id="unlock-dialog-title">Unlock LLM provider and model?</p>
      <p class="unlock-sub">
        This will let you change the provider or model. Your current output stays untouched — you'll get
        a separate confirmation if you actually pick a different model.
      </p>
      <div class="unlock-actions">
        <button class="unlock-btn unlock-danger" onclick={confirmUnlock}>unlock</button>
        <button class="unlock-btn" onclick={cancelUnlock}>cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Row shared ─────────────────────────────────────────────────────────── */
  .toolbar-row {
    display: flex;
    align-items: center;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  /* ── Row 1: tabs + actions ──────────────────────────────────────────────── */
  .toolbar-tabs {
    height: 36px;
    justify-content: space-between;
    padding-right: 16px;
    position: relative;
    z-index: 10;
  }

  .format-tabs {
    display: flex;
    align-items: stretch;
    height: 100%;
  }

  .format-tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0 11px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    margin-bottom: -1px;
    transition: color 0.1s;
    white-space: nowrap;
    height: 100%;
  }

  .format-tabs button:hover:not(:disabled) { color: var(--ink); }

  .format-tabs button.active {
    color: var(--ink);
    font-weight: 700;
  }


  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .actions button {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent);
  }

  .actions button:hover:not(:disabled) { background: var(--border); }
  .actions button:disabled { opacity: 0.35; cursor: default; }
  /* Import is the primary entry-point — slightly larger than peers. */
  .actions button.import-btn {
    font-size: 13px;
    padding: 3px 10px;
    font-weight: 500;
  }
  .actions button.ok { color: var(--ok); border-color: var(--ok); }
  .actions button.editor-btn { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .actions button.editor-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .actions button.hf-btn { color: var(--syntax-key); border-color: color-mix(in srgb, var(--syntax-key) 40%, transparent); }
  .actions button.hf-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--syntax-key) 10%, transparent); }
  .actions button.utilities-btn { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .actions button.utilities-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .actions button.stats-btn { color: var(--syntax-key); border-color: color-mix(in srgb, var(--syntax-key) 40%, transparent); }
  .actions button.stats-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--syntax-key) 10%, transparent); }
  .actions button.stats-btn.active { background: color-mix(in srgb, var(--syntax-key) 18%, transparent); color: var(--syntax-key); border-color: var(--syntax-key); }

  /* ── Row 2: info zone ───────────────────────────────────────────────────── */
  .toolbar-info {
    height: 32px;
    padding: 0 16px;
    gap: 0;
    font-size: 12px;
    overflow: visible;
    position: relative;
    z-index: 20;
  }

  .info-sep {
    color: var(--muted);
    margin: 0 7px;
    user-select: none;
  }

  .info-text {
    color: var(--ink);
    white-space: nowrap;
  }

  .info-text.dim {
    color: var(--ink-dim);
  }

  .col {
    color: var(--syntax-key);
  }

  .warn {
    font-size: 12px;
    color: var(--warn);
    cursor: help;
  }

  /* Lock toggle button — identical styling to the Editor tab read-only btn.
     Icon-only, no border, no background. Red when locked, green when
     unlocked, with a tinted background only on hover. */
  .lock-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 2px;
    padding: 3px 6px;
    cursor: pointer;
    margin-left: 4px;
    transition: background 0.1s;
  }
  .lock-btn svg { flex-shrink: 0; }
  .lock-btn.locked { color: var(--err); }
  .lock-btn.locked:hover { background: color-mix(in srgb, var(--err) 12%, transparent); }
  .lock-btn.unlocked { color: var(--ok); }
  .lock-btn.unlocked:hover { background: color-mix(in srgb, var(--ok) 12%, transparent); }

  .lock-countdown {
    font-size: 11px;
    color: var(--ok);
    font-variant-numeric: tabular-nums;
    margin-left: 2px;
    cursor: help;
    min-width: 24px;
  }

  /* Disabled select while locked — clearly grayed out so the user sees it
     can't be edited until the lock is released. */
  .setting-select.locked,
  .setting-select:disabled {
    opacity: 0.45;
    color: var(--ink-dim) !important;
    background-color: color-mix(in srgb, var(--ink-dim) 8%, transparent) !important;
    cursor: not-allowed;
    border-color: var(--border);
  }

  /* Unlock confirmation modal */
  .unlock-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .unlock-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 20px 24px;
    max-width: 460px;
    width: calc(100vw - 32px);
  }
  .unlock-title { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0 0 8px; }
  .unlock-sub   { font-size: 12px; color: var(--ink-dim); margin: 0 0 16px; line-height: 1.5; }
  .unlock-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .unlock-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .unlock-btn:hover { color: var(--ink); border-color: var(--ink-dim); }
  .unlock-btn.unlock-danger { color: var(--err); border-color: var(--err); }
  .unlock-btn.unlock-danger:hover { background: color-mix(in srgb, var(--err) 14%, transparent); }

  /* ── Inline preset picker ───────────────────────────────────────────────── */
  .info-left {
    display: flex;
    align-items: center;
    position: relative;
  }

  .picker {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    padding: 3px 5px;
    border-radius: 2px;
    white-space: nowrap;
  }

  .picker:hover,
  .picker.open {
    background: var(--border);
  }

  .dot {
    color: var(--accent);
    font-size: 9px;
  }

  .arrow {
    color: var(--ink-dim);
    font-size: 9px;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    min-width: 280px;
    max-height: 320px;
    overflow-y: auto;
    z-index: 50;
    padding: 4px 0;
  }

  .provider-group {
    padding: 4px 0;
  }

  .provider-group + .provider-group {
    border-top: 1px solid var(--border);
  }

  .provider-label {
    display: block;
    padding: 4px 12px 2px;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .preset-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    text-align: left;
    gap: 12px;
  }

  .preset-option:hover { background: var(--border); }
  .preset-option.selected { color: var(--accent); }
  .preset-option.selected::before { content: '✓ '; }

  .option-name { flex: 1; }
  .option-price {
    font-size: 11px;
    color: var(--ink-dim);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* ── Inline settings controls ───────────────────────────────────────────── */
  .setting-select {
    appearance: none;
    -webkit-appearance: none;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 1px 18px 1px 6px;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='%23a8a296' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 5px center;
  }

  .setting-select:hover {
    border-color: var(--ink-dim);
  }

  .setting-select option {
    background: var(--surface);
    color: var(--ink);
  }

  .inline-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 12px;
    color: var(--ink-dim);
    user-select: none;
  }

  .inline-toggle input[type='checkbox'] {
    accent-color: var(--accent);
    cursor: pointer;
    margin: 0;
    width: 12px;
    height: 12px;
  }

  /* ── Row 3: JSONL conversation settings ─────────────────────────────────── */
  .toolbar-jsonl-settings {
    height: 32px;
    padding: 0 16px;
    gap: 0;
    font-size: 12px;
    overflow: hidden;
    position: relative;
    z-index: 15;
  }

  .toolbar-jsonl-settings .info-text.dim {
    color: var(--ink-dim);
    margin-right: 5px;
    white-space: nowrap;
  }

  .role-input {
    width: 80px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 1px 6px;
    outline: none;
  }

  .role-input:focus { border-color: var(--accent); }
  .role-input::placeholder { color: var(--muted); }

  .sys-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 1px 6px;
    outline: none;
  }

  .sys-input:focus { border-color: var(--accent); }
  .sys-input::placeholder { color: var(--muted); font-style: italic; }
</style>
