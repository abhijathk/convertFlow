import { writable, get } from 'svelte/store';
import { appSettings, setSyntaxTheme } from './appSettings';

export type Tab = 'convert' | 'chunk' | 'editor' | 'utilities';
export type Theme = 'dark' | 'light';

export interface PaletteAction {
  type: 'load-example' | 'exact-tokens' | 'copy-share' | 'switch-preset';
  payload?: string;
}

export interface ShellState {
  activeTab: Tab;
  theme: Theme;
  paletteOpen: boolean;
  emailCaptured: boolean;
  pendingAction: PaletteAction | null;
  pendingChunkSource: string | null;
  pendingConvertSource: string | null;
}

const THEME_KEY = 'dataprep-theme';
const TAB_KEY = 'dataprep-active-tab';

function loadActiveTab(): Tab {
  if (typeof localStorage === 'undefined') return 'convert';
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === 'convert' || v === 'chunk' || v === 'editor' || v === 'utilities') return v;
  } catch { /* ignore */ }
  return 'convert';
}

export const shellState = writable<ShellState>({
  activeTab: loadActiveTab(),
  theme: 'dark', // rehydrated on mount
  paletteOpen: false,
  emailCaptured: false,
  pendingAction: null,
  pendingChunkSource: null,
  pendingConvertSource: null,
});

// Persist active tab so refresh stays on the current page.
shellState.subscribe(s => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(TAB_KEY, s.activeTab); } catch { /* ignore */ }
});

// ── System theme detection ────────────────────────────────────────────────
// When appSettings.themeMode === 'auto', the global theme follows the OS
// preference via (prefers-color-scheme: dark). We listen once at module
// load and update <html data-theme> + shellState.theme whenever the OS
// flips and the user is on 'auto'.

function applyTheme(theme: Theme) {
  shellState.update(s => (s.theme === theme ? s : { ...s, theme }));
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // Keep Monaco syntax theme in sync
  if (typeof window !== 'undefined') {
    const currentSyntax = get(appSettings).syntaxTheme;
    if (theme === 'light' && currentSyntax === 'dataprep-dark') {
      setSyntaxTheme('dataprep-light');
    } else if (theme === 'dark' && currentSyntax === 'dataprep-light') {
      setSyntaxTheme('dataprep-dark');
    }
  }
}

function readSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  // In the Tauri webview, prefers-color-scheme is unreliable across platforms
  // (webkit2gtk on Linux always returns false; macOS WKWebView is inconsistent).
  // Default to dark (the app's design base) when running as a desktop app.
  if ('__TAURI_INTERNALS__' in window) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (e: MediaQueryListEvent) => {
    if (get(appSettings).themeMode === 'auto') {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

// Apply the right theme on every appSettings.themeMode change.
appSettings.subscribe(s => {
  if (s.themeMode === 'auto') applyTheme(readSystemTheme());
  else applyTheme(s.themeMode);
});

export function sendToChunk(content: string) {
  shellState.update(s => ({ ...s, pendingChunkSource: content, activeTab: 'chunk' }));
}

export function sendToConvert(content: string) {
  shellState.update(s => ({ ...s, pendingConvertSource: content, activeTab: 'convert' }));
}

export function consumePendingChunkSource(): string | null {
  let source: string | null = null;
  shellState.update(s => {
    source = s.pendingChunkSource;
    return { ...s, pendingChunkSource: null };
  });
  return source;
}

export function consumePendingConvertSource(): string | null {
  let source: string | null = null;
  shellState.update(s => {
    source = s.pendingConvertSource;
    return { ...s, pendingConvertSource: null };
  });
  return source;
}

export function setTab(tab: Tab) {
  shellState.update(s => ({ ...s, activeTab: tab }));
}

export function toggleTheme() {
  // Toggle now flips the user's preference — moves between light/dark.
  // If they were on 'auto', switch to the OPPOSITE of the currently
  // applied OS theme so the click feels responsive.
  const settings = get(appSettings);
  const current = settings.themeMode === 'auto' ? readSystemTheme() : settings.themeMode;
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  appSettings.update(s => ({ ...s, themeMode: next }));
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, next);
  // applyTheme is called by the appSettings subscriber, so no direct call here.
}

// Re-apply the user's preference after rehydration in TopBar etc.
export function setThemeMode(mode: 'auto' | 'light' | 'dark') {
  appSettings.update(s => ({ ...s, themeMode: mode }));
}

import { writable as _writable } from 'svelte/store';
export const paletteQuery = _writable('');

// Ephemeral UI toggles for Convert tab — controlled from TabStrip, consumed by ConvertTab.
export const convertStatsOpen = _writable(false);
export const convertHfDialogOpen = _writable(false);

// Ephemeral UI toggle for Chunk tab stats panel.
export const chunkStatsOpen = _writable(false);

export function openPalette() {
  shellState.update(s => ({ ...s, paletteOpen: true }));
}

export function closePalette() {
  shellState.update(s => ({ ...s, paletteOpen: false }));
  paletteQuery.set('');
}

export function dispatchPaletteAction(action: PaletteAction) {
  shellState.update(s => ({ ...s, paletteOpen: false, pendingAction: action }));
}

export function clearPaletteAction() {
  shellState.update(s => ({ ...s, pendingAction: null }));
}
