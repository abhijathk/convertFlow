import { writable } from 'svelte/store';

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

export const shellState = writable<ShellState>({
  activeTab: 'convert',
  theme: 'dark', // rehydrated on mount
  paletteOpen: false,
  emailCaptured: false,
  pendingAction: null,
  pendingChunkSource: null,
  pendingConvertSource: null,
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
    return { ...s, theme: next };
  });
}

import { writable as _writable } from 'svelte/store';
export const paletteQuery = _writable('');

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
