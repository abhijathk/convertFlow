<script lang="ts">
  import { shellState, setTab, convertStatsOpen, convertHfDialogOpen, chunkStatsOpen } from '../stores/shellState';
  import { convertState } from '../stores/convertState';
  import { chunkState } from '../stores/chunkState';
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

  // ── Desktop detection ─────────────────────────────────────────────────────
  let isDesktop = $derived(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);

  // ── External link helper (works in Tauri webview) ─────────────────────────
  async function openExternal(url: string) {
    if (isDesktop) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // ── About / update check ──────────────────────────────────────────────────
  const APP_VERSION = '0.1.4'; // keep in sync with src-tauri/tauri.conf.json and package.json
  let updateStatus = $state<'idle' | 'checking' | 'uptodate' | 'available' | 'error'>('idle');
  let latestVersion = $state<string | null>(null);

  async function checkForUpdates() {
    updateStatus = 'checking';
    latestVersion = null;
    try {
      const res = await fetch('https://convertflow.live/latest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { version: string };
      latestVersion = data.version;
      updateStatus = data.version === APP_VERSION ? 'uptodate' : 'available';
    } catch {
      updateStatus = 'error';
    }
  }

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

  // ── Settings popover nav rail ────────────────────────────────────────────
  type SectionKey = 'appearance' | 'syntax' | 'editor' | 'convert' | 'chunk' | 'desktop' | 'advanced' | 'privacy' | 'about' | 'support';
  const SETTINGS_SECTIONS: { key: SectionKey; label: string; desktopOnly?: boolean }[] = [
    { key: 'appearance', label: 'Appearance' },
    { key: 'syntax',     label: 'Syntax' },
    { key: 'editor',     label: 'Editor' },
    { key: 'convert',    label: 'Convert' },
    { key: 'chunk',      label: 'Chunk' },
    { key: 'desktop',    label: 'Desktop', desktopOnly: true },
    { key: 'advanced',   label: 'Advanced' },
    { key: 'privacy',    label: 'Privacy' },
    { key: 'about',      label: 'About' },
    { key: 'support',    label: 'Support' },
  ];
  let activeSection = $state<SectionKey>('appearance');
  function scrollToSettingsSection(key: SectionKey) {
    activeSection = key;
    const el = document.getElementById(`settings-section-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  {#if activeTab === 'chunk'}
    <button
      class="convert-action-btn"
      class:active={$chunkStatsOpen}
      onclick={() => chunkStatsOpen.update(v => !v)}
      disabled={$chunkState.chunks.length === 0}
      title="Chunk health stats"
    >stats</button>
  {/if}

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
        <aside class="settings-nav" aria-label="Settings sections">
          {#each SETTINGS_SECTIONS as s}
            {#if !s.desktopOnly || isDesktop}
              <button
                class="settings-nav-btn"
                class:active={activeSection === s.key}
                onclick={() => scrollToSettingsSection(s.key)}
                aria-controls="settings-section-{s.key}"
              >{s.label}</button>
            {/if}
          {/each}
        </aside>
        <div class="settings-content">
        <div class="settings-section" id="settings-section-appearance">
          <span class="settings-label">appearance</span>
          <div class="setting-row">
            <span>Theme</span>
            <div class="theme-mode-group">
              {#each (['auto','light','dark'] as const) as mode}
                <button
                  class="theme-mode-btn"
                  class:active={$appSettings.themeMode === mode}
                  onclick={() => updateAppSetting('themeMode', mode)}
                  title={mode === 'auto' ? 'Follow OS preference' : `Force ${mode} mode`}
                >{mode}</button>
              {/each}
            </div>
          </div>
          <label class="setting-row">
            <span>Show support panel</span>
            <input type="checkbox" checked={$appSettings.showSupportPanel} onchange={(e) => updateAppSetting('showSupportPanel', e.currentTarget.checked)} />
          </label>
        </div>

        <div class="settings-section" id="settings-section-syntax">
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

        <div class="settings-section" id="settings-section-editor">
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

        <div class="settings-section" id="settings-section-convert">
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

          <div class="setting-row stacked">
            <span>OpenAI API key <span class="key-hint">(for fine-tune push)</span></span>
            <input
              type="password"
              class="key-input"
              value={$appSettings.openaiApiKey}
              placeholder="sk-..."
              autocomplete="off"
              oninput={(e) => updateAppSetting('openaiApiKey', e.currentTarget.value)}
            />
          </div>
          <div class="setting-row stacked">
            <span>Anthropic API key <span class="key-hint">(for fine-tune push)</span></span>
            <input
              type="password"
              class="key-input"
              value={$appSettings.anthropicApiKey}
              placeholder="sk-ant-..."
              autocomplete="off"
              oninput={(e) => updateAppSetting('anthropicApiKey', e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="settings-section" id="settings-section-chunk">
          <span class="settings-label">chunk</span>
          <label class="setting-row">
            <span>Images by default</span>
            <input type="checkbox" checked={$appSettings.chunkEnableImagesDefault} onchange={(e) => updateAppSetting('chunkEnableImagesDefault', e.currentTarget.checked)} />
          </label>
          <label class="setting-row">
            <span>OCR by default</span>
            <input type="checkbox" checked={$appSettings.chunkEnableOcrDefault} onchange={(e) => updateAppSetting('chunkEnableOcrDefault', e.currentTarget.checked)} />
          </label>
        </div>

        {#if isDesktop}
          <div class="settings-section" id="settings-section-desktop">
            <span class="settings-label">desktop</span>
            <label class="setting-row">
              <span>Start minimized</span>
              <input type="checkbox" checked={$appSettings.desktopStartMinimized} onchange={(e) => updateAppSetting('desktopStartMinimized', e.currentTarget.checked)} />
            </label>
            <label class="setting-row">
              <span>Minimize to system tray</span>
              <input type="checkbox" checked={$appSettings.desktopMinimizeToTray} onchange={(e) => updateAppSetting('desktopMinimizeToTray', e.currentTarget.checked)} />
            </label>
            <label class="setting-row">
              <span>Remember window size</span>
              <input type="checkbox" checked={$appSettings.desktopRememberWindowSize} onchange={(e) => updateAppSetting('desktopRememberWindowSize', e.currentTarget.checked)} />
            </label>
            <label class="setting-row">
              <span>Auto-check for updates</span>
              <input type="checkbox" checked={$appSettings.desktopAutoUpdate} onchange={(e) => updateAppSetting('desktopAutoUpdate', e.currentTarget.checked)} />
            </label>
            <label class="setting-row">
              <span>Confirm before exit</span>
              <input type="checkbox" checked={$appSettings.desktopConfirmExit} onchange={(e) => updateAppSetting('desktopConfirmExit', e.currentTarget.checked)} />
            </label>
          </div>
        {/if}

        <div class="settings-section" id="settings-section-advanced">
          <span class="settings-label">advanced</span>
          <label class="setting-row">
            <span>Advanced features</span>
            <input type="checkbox" checked={$appSettings.advancedFeaturesEnabled} onchange={(e) => updateAppSetting('advancedFeaturesEnabled', e.currentTarget.checked)} />
          </label>
          <div class="setting-row stacked">
            <span class="setting-row-sub">
              Enables multi-prompt mode, lock controls (preset + prep settings), and lock confirmation modals.
              Most users don't need this.
            </span>
          </div>

          {#if $appSettings.advancedFeaturesEnabled}
            <label class="setting-row">
              <span>Skip lock confirmations</span>
              <input type="checkbox" checked={$appSettings.skipLockConfirmation} onchange={(e) => updateAppSetting('skipLockConfirmation', e.currentTarget.checked)} />
            </label>
            <label class="setting-row">
              <span>Preset auto-lock (seconds)</span>
              <input type="number" min="0" max="600" step="5" value={$appSettings.presetAutoLockSeconds} onchange={(e) => updateAppSetting('presetAutoLockSeconds', Math.max(0, Number(e.currentTarget.value) || 0))} class="number-input" />
            </label>
            <label class="setting-row">
              <span>Prep auto-lock (seconds)</span>
              <input type="number" min="0" max="600" step="5" value={$appSettings.prepAutoLockSeconds} onchange={(e) => updateAppSetting('prepAutoLockSeconds', Math.max(0, Number(e.currentTarget.value) || 0))} class="number-input" />
            </label>
            <label class="setting-row">
              <span>Multi-prompt default mode</span>
              <select class="select-input" value={$appSettings.defaultMultiPromptMode} onchange={(e) => updateAppSetting('defaultMultiPromptMode', e.currentTarget.value as 'round-robin' | 'random')}>
                <option value="round-robin">round-robin</option>
                <option value="random">random</option>
              </select>
            </label>
            <div class="setting-row stacked">
              <span>Local LLM endpoint <span class="key-hint">(Ollama / LM Studio)</span></span>
              <input
                type="text"
                class="key-input"
                value={$appSettings.localLlmEndpoint}
                placeholder="http://localhost:11434"
                autocomplete="off"
                oninput={(e) => updateAppSetting('localLlmEndpoint', e.currentTarget.value)}
              />
            </div>
            <div class="setting-row stacked">
              <span>Local LLM model</span>
              <input
                type="text"
                class="key-input"
                value={$appSettings.localLlmModel}
                placeholder="llama3.1"
                autocomplete="off"
                oninput={(e) => updateAppSetting('localLlmModel', e.currentTarget.value)}
              />
            </div>
          {/if}
        </div>

        <div class="settings-section" id="settings-section-privacy">
          <span class="settings-label">privacy</span>
          <label class="setting-row">
            <span>Anonymous telemetry</span>
            <input type="checkbox" checked={$appSettings.telemetryEnabled} onchange={(e) => updateAppSetting('telemetryEnabled', e.currentTarget.checked)} />
          </label>
          <button class="settings-action" onclick={() => { clearHfHubToken(); settingsOpen = false; }}>Clear HF Hub token</button>
          <button class="settings-action danger" onclick={() => (confirmingClear = true)}>Clear all stored data…</button>
        </div>

        <div class="settings-section" id="settings-section-about">
          <span class="settings-label">about</span>
          <div class="setting-row">
            <span>Version</span>
            <span class="version-label">v{APP_VERSION}</span>
          </div>
          <div class="setting-row">
            <span>Check for updates</span>
            <button class="settings-action" onclick={checkForUpdates} disabled={updateStatus === 'checking'}>
              {#if updateStatus === 'checking'}checking…
              {:else if updateStatus === 'uptodate'}✓ up to date
              {:else if updateStatus === 'available'}↑ v{latestVersion} available
              {:else if updateStatus === 'error'}× check failed
              {:else}check now
              {/if}
            </button>
          </div>
          {#if updateStatus === 'available' && latestVersion}
            <div class="setting-row stacked">
              <a class="update-link" href="https://convertflow.live#download" target="_blank" rel="noopener noreferrer">
                Download v{latestVersion} →
              </a>
            </div>
          {/if}
          <div class="setting-row stacked">
            <a class="about-link" href="https://convertflow.live" target="_blank" rel="noopener noreferrer">convertflow.live</a>
            <a class="about-link" href="https://convertflow.live/help" target="_blank" rel="noopener noreferrer">documentation</a>
            <a class="about-link" href="https://convertflow.live/about" target="_blank" rel="noopener noreferrer">about</a>
          </div>
        </div>

        <div class="settings-section" id="settings-section-support">
          <span class="settings-label">support</span>
          <div class="setting-row stacked">
            <a class="about-link" href="mailto:support@quakkainfo.com?subject=Sponsor a feature">Sponsor a feature →</a>
            <a class="about-link" href="mailto:support@quakkainfo.com?subject=Bug report">Report a bug →</a>
            <button class="about-link-btn" onclick={() => openExternal('https://convertflow.live/support')}>Visit support page →</button>
          </div>
        </div>
        </div>
        <!-- Pinned: always visible regardless of which section is in view -->
        <footer class="settings-footer">
          <button class="settings-coffee-btn" onclick={() => openExternal('https://buymeacoffee.com/abhijathkat')} title="Support convertFlow — opens Buy Me a Coffee">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h8v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Z"/>
              <path d="M11 7h1.5a1.5 1.5 0 0 1 0 3H11"/>
              <path d="M5 2v2M7 2v2M9 2v2"/>
            </svg>
            <span>Buy me a coffee</span>
          </button>
        </footer>
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
    padding: 0;
    width: 420px;
    max-height: 70vh;
    z-index: 200;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    display: grid;
    grid-template-columns: 108px 1fr;
    grid-template-rows: 1fr auto;
    overflow: hidden;
  }

  .settings-nav {
    grid-column: 1;
    grid-row: 1 / span 2;
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    background: color-mix(in srgb, var(--bg) 70%, var(--surface));
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }
  .settings-nav-btn {
    background: none;
    border: none;
    text-align: left;
    padding: 6px 14px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: color 0.1s, border-color 0.1s, background 0.1s;
  }
  .settings-nav-btn:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .settings-nav-btn.active {
    color: var(--accent);
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .settings-content {
    grid-column: 2;
    grid-row: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .settings-footer {
    grid-column: 2;
    grid-row: 2;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    justify-content: stretch;
  }
  .settings-coffee-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    color: var(--accent);
    border-radius: 3px;
    padding: 6px 12px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s;
  }
  .settings-coffee-btn:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  @media (max-width: 600px) {
    .settings-popover {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-height: 80vh;
      border-radius: 10px 10px 0 0;
      border-bottom: none;
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr auto;
    }
    .settings-nav {
      grid-column: 1;
      grid-row: 1;
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      border-right: none;
      border-bottom: 1px solid var(--border);
      padding: 4px;
    }
    .settings-nav-btn {
      border-left: none;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }
    .settings-nav-btn.active {
      border-left-color: transparent;
      border-bottom-color: var(--accent);
    }
    .settings-content { grid-column: 1; grid-row: 2; }
    .settings-footer  { grid-column: 1; grid-row: 3; }
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

  .setting-row-sub {
    font-size: 11px;
    color: var(--ink-dim);
    line-height: 1.4;
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

  /* ── Appearance: theme mode button group ──────────────────────────────── */
  .theme-mode-group {
    display: inline-flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .theme-mode-btn {
    background: none;
    border: none;
    padding: 4px 10px;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    cursor: pointer;
    border-right: 1px solid var(--border);
    text-transform: lowercase;
  }
  .theme-mode-btn:last-child { border-right: none; }
  .theme-mode-btn:hover { color: var(--ink); background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .theme-mode-btn.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); font-weight: 500; }

  /* ── About section ────────────────────────────────────────────────────── */
  .version-label {
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--ink-dim);
    font-size: 11px;
  }
  .update-link {
    font-size: 12px;
    color: var(--accent);
    text-decoration: none;
  }
  .update-link:hover { text-decoration: underline; }
  .about-link {
    font-size: 11px;
    color: var(--ink-dim);
    text-decoration: none;
    padding: 2px 0;
  }
  .about-link:hover { color: var(--accent); }
  .about-link-btn {
    background: none;
    border: none;
    padding: 2px 0;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    text-align: left;
    text-decoration: none;
  }
  .about-link-btn:hover { color: var(--accent); }
  .settings-action:disabled { opacity: 0.5; cursor: wait; }

  .key-input {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px 8px;
    color: var(--ink);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    outline: none;
    box-sizing: border-box;
  }
  .key-input:focus { border-color: var(--accent); }
  .key-input::placeholder { color: var(--muted); }

  .key-hint {
    font-size: 10px;
    color: var(--muted);
    font-weight: 400;
    letter-spacing: 0;
  }
</style>
