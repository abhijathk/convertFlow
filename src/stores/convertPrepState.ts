import { writable } from 'svelte/store';
import type { ImportTemplate, PromptRotationMode } from '../lib/convert-import';

export interface ConvertPrepState {
  template: ImportTemplate;
  systemPrompt: string;
  userEditedPrompt: boolean;
  chunkSize: number;
  // Multi-prompt
  multiPromptEnabled: boolean;
  multiPromptMode: PromptRotationMode;
  multiPromptSeed: number;
  multiPrompts: string[];
}

const STORAGE_KEY = 'dataprep:convert-prep-v1';

function defaultState(): ConvertPrepState {
  return {
    template: 'qa',
    systemPrompt: 'You are a helpful assistant.',
    userEditedPrompt: false,
    chunkSize: 512,
    multiPromptEnabled: false,
    multiPromptMode: 'round-robin',
    multiPromptSeed: 42,
    multiPrompts: [],
  };
}

function loadFromStorage(): ConvertPrepState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...(JSON.parse(raw) as Partial<ConvertPrepState>) };
  } catch {
    return defaultState();
  }
}

export const convertPrepState = writable<ConvertPrepState>(
  typeof localStorage !== 'undefined' ? loadFromStorage() : defaultState()
);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
convertPrepState.subscribe(state => {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  }, 500);
});
