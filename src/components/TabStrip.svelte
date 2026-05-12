<script lang="ts">
  import { shellState, setTab, convertStatsOpen, convertHfDialogOpen } from '../stores/shellState';
  import { convertState } from '../stores/convertState';
  import { isMac, shortcut } from '../lib/platform';
  import { appSettings, setSyntaxTheme, updateAppSetting, clearAllStoredData, clearHfHubToken } from '../stores/appSettings';
  import { THEMES } from '../lib/monaco-theme';
  import presetsJson from '../data/presets.json';

  let appMode = $derived($shellState.theme); // 'dark' | 'light'
  let visibleThemes = $derived(THEMES.filter(t => t.mode === appMode));

  let activeTab = $derived($shellState.activeTab);
  let k1 = $state('⌘1');
  let k2 = $state('⌘2');
  let k3 = $state('⌘3');
  let k4 = $state('⌘4');
  $effect(() => { k1 = shortcut('1'); k2 = shortcut('2'); k3 = shortcut('3'); k4 = shortcut('4'); });

  let settingsOpen = $state(false);
  let confirmingClear = $state(false);

  function confirmClearAll() {
    clearAllStoredData();
    confirmingClear = false;
    settingsOpen = false;
    location.reload();
  }

  // ── Default preset: provider → model selection ──────────────────────────
  const presetProviders = [...new Set(presetsJson.map(p => p.provider))];
  function presetsForProvider(provider: string) {
    return presetsJson.filter(p => p.provider === provider);
  }
  let defaultPreset = $derived(presetsJson.find(p => p.id === $appSettings.defaultPresetId) ?? presetsJson[0]);
  let defaultProvider = $derived(defaultPreset?.provider ?? presetProviders[0]);
  let modelsForDefaultProvider = $derived(presetsForProvider(defaultProvider));

  function onDefaultProviderChange(provider: string) {
    const first = presetsForProvider(provider)[0];
    if (first) updateAppSetting('defaultPresetId', first.id);
  }

  function handleKeydown(e: KeyboardEvent) {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod && e.key === '1') { e.preventDefault(); setTab('convert'); }
    if (mod && e.key === '2') { e.preventDefault(); setTab('chunk'); }
    if (mod && e.key === '3') { e.preventDefault(); setTab('editor'); }
    if (mod && e.key === '4') { e.preventDefault(); setTab('utilities'); }
    if (e.key === 'Escape') settingsOpen = false;
  }

  function handleOutsideClick(e: MouseEvent) {
    if (settingsOpen) {
      const el = (e.target as Element).closest('.settings-wrap');
      if (!el) settingsOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleOutsideClick} />

<div class="tabstrip" role="tablist" aria-label="convertFlow tabs">
  <button
    role="tab"
    aria-selected={activeTab === 'convert'}
    aria-controls="panel-convert"
    id="tab-convert"
    class:active={activeTab === 'convert'}
    onclick={() => setTab('convert')}
  >
    Convert <kbd>{k1}</kbd>
  </button>
  <button
    role="tab"
    aria-selected={activeTab === 'chunk'}
    aria-controls="panel-chunk"
    id="tab-chunk"
    class:active={activeTab === 'chunk'}
    onclick={() => setTab('chunk')}
  >
    Chunk <kbd>{k2}</kbd>
  </button>
  <button
    role="tab"
    aria-selected={activeTab === 'editor'}
    aria-controls="panel-editor"
    id="tab-editor"
    class:active={activeTab === 'editor'}
    onclick={() => setTab('editor')}
  >
    Editor <kbd>{k3}</kbd>
  </button>
  <button
    role="tab"
    aria-selected={activeTab === 'utilities'}
    aria-controls="panel-utilities"
    id="tab-utilities"
    class:active={activeTab === 'utilities'}
    onclick={() => setTab('utilities')}
  >
    Utilities <kbd>{k4}</kbd>
  </button>

  <div class="spacer"></div>

  {#if activeTab === 'convert'}
    <button
      class="convert-action-btn"
      class:active={$convertStatsOpen}
      onclick={() => convertStatsOpen.update(v => !v)}
      disabled={!$convertState.editorContent?.trim()}
      title="Dataset health stats"
    >stats</button>
    <button
      class="convert-action-btn"
      onclick={() => convertHfDialogOpen.set(true)}
      disabled={!$convertState.editorContent?.trim()}
      title="Push dataset to Hugging Face Hub"
    >↑ HF Hub</button>
  {/if}

  <!-- Settings -->
  <div class="settings-wrap">
    <button
      class="settings-btn"
      class:open={settingsOpen}
      onclick={(e) => { e.stopPropagation(); settingsOpen = !settingsOpen; }}
      title="Settings"
      aria-label="Settings"
      aria-expanded={settingsOpen}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

    {#if settingsOpen}
      <div class="settings-popover" role="dialog" aria-label="Settings">
        <div class="settings-section">
          <span class="settings-label">syntax theme</span>
          <div class="theme-list">
            {#each visibleThemes as t (t.id)}
              <button
                class="theme-row"
                class:active={$appSettings.syntaxTheme === t.id}
                onclick={() => { setSyntaxTheme(t.id); }}
              >
                <span class="swatch" style="background:{t.swatch}"></span>
                {t.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="settings-section">
          <span class="settings-label">editor</span>
          <label class="setting-row">
            <span>Word wrap</span>
            <input type="checkbox" checked={$appSettings.editorWordWrap} onchange={(e) => updateAppSetting('editorWordWrap', e.currentTarget.checked)} />
          </label>
          <label class="setting-row">
            <span>Minimap</span>
            <input type="checkbox" checked={$appSettings.editorMinimap} onchange={(e) => updateAppSetting('editorMinimap', e.currentTarget.checked)} />
          </label>
          <div class="setting-row stacked">
            <div class="setting-row-header">
              <span>Font size</span>
              <input
                type="number"
                min="10"
                max="24"
                step="1"
                value={$appSettings.editorFontSize}
                oninput={(e) => updateAppSetting('editorFontSize', Math.max(10, Math.min(24, Number(e.currentTarget.value) || 14)))}
                class="number-input"
              />
            </div>
            <div class="font-preview" style="font-size: {$appSettings.editorFontSize}px;"><span class="tk-punct">{`{`}</span><span class="tk-key">"role"</span><span class="tk-punct">:</span> <span class="tk-str">"user"</span><span class="tk-punct">{`}`}</span></div>
          </div>
        </div>

        <div class="settings-section">
          <span class="settings-label">convert</span>
          <label class="setting-row">
            <span>Sample threshold (rows)</span>
            <input
              type="number"
              min="50"
              max="100000"
              step="50"
              value={$appSettings.convertSampleThreshold}
              onchange={(e) => updateAppSetting('convertSampleThreshold', Math.max(50, Number(e.currentTarget.value) || 500))}
              class="number-input"
            />
          </label>
          <div class="setting-row stacked">
            <span>Default preset</span>
            <div class="two-selects">
              <select
                class="select-input"
                value={defaultProvider}
                onchange={(e) => onDefaultProviderChange(e.currentTarget.value)}
                aria-label="Provider"
              >
                {#each presetProviders as p (p)}
                  <option value={p}>{p}</option>
                {/each}
              </select>
              <select
                class="select-input"
                value={$appSettings.defaultPresetId}
                onchange={(e) => updateAppSetting('defaultPresetId', e.currentTarget.value)}
                aria-label="Model"
              >
                {#each modelsForDefaultProvider as p (p.id)}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <span class="settings-label">privacy</span>
          <label class="setting-row">
            <span>Anonymous telemetry</span>
            <input type="checkbox" checked={$appSettings.telemetryEnabled} onchange={(e) => updateAppSetting('telemetryEnabled', e.currentTarget.checked)} />
          </label>
          <button class="settings-action" onclick={() => { clearHfHubToken(); settingsOpen = false; }}>Clear HF Hub token</button>
          <button class="settings-action danger" onclick={() => (confirmingClear = true)}>Clear all stored data…</button>
        </div>
      </div>
    {/if}

    {#if confirmingClear}
      <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirm clear">
        <div class="confirm-box">
          <p class="confirm-title">Clear ALL local data?</p>
          <p class="confirm-sub">All open files, datasets, chunks, presets, settings, and tokens will be removed. This cannot be undone. The page will reload.</p>
          <div class="confirm-actions">
            <button class="confirm-btn danger" onclick={confirmClearAll}>clear everything</button>
            <button class="confirm-btn" onclick={() => (confirmingClear = false)}>cancel</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .tabstrip {
    display: flex;
    align-items: stretch;
    height: 36px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 8px 0 16px;
    gap: 0;
    flex-shrink: 0;
    position: relative;
  }
  button[role="tab"] {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink-dim);
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: -1px;
    transition: color 0.1s;
  }
  button[role="tab"]:hover { color: var(--ink); }
  button[role="tab"].active {
    color: var(--ink);
    font-weight: 700;
    border-bottom-color: var(--accent);
  }
  kbd {
    font-family: inherit;
    font-size: 11px;
    color: var(--accent);
    opacity: 0.7;
  }
  button[role="tab"].active kbd { opacity: 1; }

  @media (max-width: 600px) {
    button[role="tab"] kbd { display: none; }
    button[role="tab"] { padding: 0 10px; }
  }

  .spacer { flex: 1; }

  .convert-action-btn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--syntax-key) 40%, transparent);
    border-radius: 3px;
    padding: 3px 9px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--syntax-key);
    margin: 0 4px;
    align-self: center;
    transition: color 0.1s, border-color 0.1s, background 0.1s;
  }
  .convert-action-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--syntax-key) 10%, transparent);
    border-color: var(--syntax-key);
  }
  .convert-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .convert-action-btn.active {
    background: color-mix(in srgb, var(--syntax-key) 18%, transparent);
    color: var(--syntax-key);
    border-color: var(--syntax-key);
  }

  .settings-wrap {
    display: flex;
    align-items: center;
    position: relative;
  }

  .settings-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 15px;
    color: var(--ink-dim);
    padding: 0 8px;
    line-height: 36px;
    transition: color 0.1s;
  }
  .settings-btn:hover,
  .settings-btn.open { color: var(--ink); }

  .settings-popover {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 0;
    min-width: 260px;
    max-height: 70vh;
    overflow-y: auto;
    z-index: 200;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }

  @media (max-width: 600px) {
    .settings-popover {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      min-width: unset;
      max-height: 80vh;
      border-radius: 10px 10px 0 0;
      border-bottom: none;
    }
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    padding: 4px 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .settings-section:last-of-type { border-bottom: none; }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--ink-dim);
    gap: 8px;
  }
  .setting-row span { color: var(--ink); }
  .number-input {
    width: 70px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    text-align: right;
  }
  .select-input {
    flex: 1;
    max-width: 150px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    color: var(--ink);
    font-family: inherit;
    font-size: 11px;
  }
  .setting-row.stacked { flex-direction: column; align-items: stretch; gap: 4px; }
  .setting-row-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .setting-row-header span { color: var(--ink); }
  .two-selects { display: flex; gap: 6px; }
  .two-selects .select-input { flex: 1; max-width: none; }
  .range-input { width: 100%; accent-color: var(--accent); }
  .font-preview {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    line-height: 1.4;
    white-space: nowrap;
    overflow-x: auto;
  }
  .font-preview .tk-punct { color: var(--ink-dim); }
  .font-preview .tk-key { color: var(--accent); }
  .font-preview .tk-str { color: var(--ok); }

  .settings-action {
    background: none;
    border: none;
    text-align: left;
    padding: 6px 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .settings-action:hover { background: var(--bg); color: var(--ink); }
  .settings-action.danger { color: var(--err); }
  .settings-action.danger:hover { background: color-mix(in srgb, var(--err) 12%, transparent); }

  .confirm-overlay {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center;
  }
  .confirm-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 20px 24px;
    max-width: 400px;
  }

  @media (max-width: 480px) {
    .confirm-box {
      width: calc(100vw - 32px);
      padding: 16px;
    }
  }

  .confirm-title { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0 0 8px; }
  .confirm-sub { font-size: 12px; color: var(--ink-dim); margin: 0 0 16px; line-height: 1.5; }
  .confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .confirm-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .confirm-btn:hover { color: var(--ink); border-color: var(--ink-dim); }
  .confirm-btn.danger { color: var(--err); border-color: var(--err); }
  .confirm-btn.danger:hover { background: color-mix(in srgb, var(--err) 14%, transparent); }

  .settings-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0 12px 4px;
  }

  .theme-list {
    display: flex;
    flex-direction: column;
    max-height: 280px;
    overflow-y: auto;
  }

  .theme-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    padding: 5px 12px;
    text-align: left;
    transition: background 0.1s;
  }
  .theme-row:hover { background: var(--bg); color: var(--ink); }
  .theme-row.active { color: var(--ink); font-weight: 600; }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
