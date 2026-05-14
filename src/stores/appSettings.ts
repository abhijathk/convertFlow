import { writable } from 'svelte/store';
import type { ThemeId } from '../lib/monaco-theme';

export interface AppSettings {
  syntaxTheme: ThemeId;
  editorWordWrap: boolean;
  editorFontSize: number;
  editorMinimap: boolean;
  convertSampleThreshold: number;
  defaultPresetId: string;
  telemetryEnabled: boolean;

  // Master toggle — when false, all advanced lock/multi-prompt UI hides and
  // the system behaves like it did before those features landed.
  advancedFeaturesEnabled: boolean;

  // Auto-lock timers (seconds). Only used when advancedFeaturesEnabled = true.
  presetAutoLockSeconds: number;
  prepAutoLockSeconds: number;

  // Skip the unlock confirmation modals (power-user mode).
  skipLockConfirmation: boolean;

  // Per-provider defaults. Keys are provider strings ("openai", "anthropic",
  // "mistral", etc.). Empty record means "no preference; use the global
  // defaults". Looked up when the user changes preset.
  defaultTemplateByProvider: Record<string, 'qa' | 'context-answer' | 'instruct'>;
  defaultChunkSizeByProvider: Record<string, number>;

  // Multi-prompt rotation mode default.
  defaultMultiPromptMode: 'round-robin' | 'random';

  // Chunk tab — toggle defaults.
  chunkEnableImagesDefault: boolean;
  chunkEnableOcrDefault: boolean;
}

const defaults: AppSettings = {
  syntaxTheme: 'dataprep-dark',
  editorWordWrap: true,
  editorFontSize: 14,
  editorMinimap: true,
  convertSampleThreshold: 500,
  defaultPresetId: 'openai-gpt-5',
  telemetryEnabled: true,
  advancedFeaturesEnabled: false,
  presetAutoLockSeconds: 30,
  prepAutoLockSeconds: 60,
  skipLockConfirmation: false,
  defaultTemplateByProvider: {},
  defaultChunkSizeByProvider: {},
  defaultMultiPromptMode: 'round-robin',
  chunkEnableImagesDefault: false,
  chunkEnableOcrDefault: false,
};

function loadSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem('dataprep:appSettings');
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults;
}

export const appSettings = writable<AppSettings>(loadSettings());

appSettings.subscribe((s) => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem('dataprep:appSettings', JSON.stringify(s)); } catch { /* ignore */ }
});

export function setSyntaxTheme(theme: ThemeId) {
  appSettings.update((s) => ({ ...s, syntaxTheme: theme }));
}

export function updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  appSettings.update((s) => ({ ...s, [key]: value }));
}

export function clearAllStoredData() {
  if (typeof localStorage === 'undefined') return;
  const keys = Object.keys(localStorage).filter(k => k.startsWith('dataprep'));
  for (const k of keys) localStorage.removeItem(k);
}

export function clearHfHubToken() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem('dataprep:hf-token');
}
