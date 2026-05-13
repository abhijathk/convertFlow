import { writable, get } from 'svelte/store';

export interface ToolInputState {
  primaryInput: string;
  autoPrefilled: boolean;
  prefillSourceFileId: string | null;
  prefillTruncated: boolean;
}

export type UtilitiesState = Record<string, ToolInputState>;

const STORAGE_KEY = 'dataprep:utilities-state-v1';

function defaultToolState(): ToolInputState {
  return { primaryInput: '', autoPrefilled: false, prefillSourceFileId: null, prefillTruncated: false };
}

function loadFromStorage(): UtilitiesState {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UtilitiesState;
    // Drop any previously auto-prefilled entries — those came from the
    // old behavior that copied the Editor's active file into every utility.
    const cleaned: UtilitiesState = {};
    for (const [id, ts] of Object.entries(parsed)) {
      if (ts.autoPrefilled) continue;
      cleaned[id] = ts;
    }
    return cleaned;
  } catch {
    return {};
  }
}

export const utilitiesState = writable<UtilitiesState>(
  typeof localStorage !== 'undefined' ? loadFromStorage() : {}
);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
utilitiesState.subscribe(state => {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, 500);
});

export function getToolState(id: string): ToolInputState {
  const state = get(utilitiesState);
  return state[id] ?? defaultToolState();
}

export function setToolInput(id: string, input: string): void {
  utilitiesState.update(s => ({
    ...s,
    [id]: { ...(s[id] ?? defaultToolState()), primaryInput: input, autoPrefilled: false, prefillSourceFileId: null },
  }));
}

export const selectedUtilityId = writable<string>('token-estimator');

export function setToolPrefilled(id: string, content: string, sourceFileId: string, truncated: boolean): void {
  utilitiesState.update(s => ({
    ...s,
    [id]: { primaryInput: content, autoPrefilled: true, prefillSourceFileId: sourceFileId, prefillTruncated: truncated },
  }));
}
