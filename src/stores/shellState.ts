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
  shellState.update(s => {
    const next: Theme = s.theme === 'dark' ? 'light' : 'dark';
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, next);
    document.documentElement.setAttribute('data-theme', next);
    // Keep the Monaco syntax theme in sync with the global theme so the
    // editor panels (left source pane + right preview pane) match the page.
    const currentSyntax = get(appSettings).syntaxTheme;
    if (next === 'light' && currentSyntax === 'dataprep-dark') {
      setSyntaxTheme('dataprep-light');
    } else if (next === 'dark' && currentSyntax === 'dataprep-light') {
      setSyntaxTheme('dataprep-dark');
    }
    return { ...s, theme: next };
  });
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
