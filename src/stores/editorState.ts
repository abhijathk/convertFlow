// Editor tab state — open files, active file, persistence.
// Persists to localStorage with 3MB-per-file cap; drops oldest on QuotaExceeded.
// Syntax theme lives in appSettings (shared across all editors).

import { writable, get } from 'svelte/store';

export interface EditorFile {
  id: string;
  name: string;
  content: string;
  dirty: boolean;
  readOnly?: boolean;
  cursor?: { line: number; column: number };
  scroll?: { top: number; left: number };
}

export interface EditorState {
  openFiles: EditorFile[];
  activeFileId: string | null;
  splitPaneOpen: boolean;
  splitPaneFormat: 'jsonl' | 'json' | 'csv' | 'md' | 'txt' | 'alpaca' | 'sharegpt';
  splitPaneOrientation: 'vertical' | 'horizontal';
  bottomPanelOpen: boolean;
  bottomPanelTab: 'find' | 'linter';
  bottomPanelHeight: number;
}

const STORAGE_KEY = 'dataprep-editor-state-v1';
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB

function defaultState(): EditorState {
  return {
    openFiles: [],
    activeFileId: null,
    splitPaneOpen: true,
    splitPaneFormat: 'csv',
    splitPaneOrientation: 'vertical',
    bottomPanelOpen: false,
    bottomPanelTab: 'find',
    bottomPanelHeight: 240,
  };
}

function loadFromStorage(): EditorState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as EditorState;
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveToStorage(state: EditorState): { ok: boolean; warnings: string[] } {
  if (typeof localStorage === 'undefined') return { ok: false, warnings: [] };
  const warnings: string[] = [];
  // Filter out files >3MB from persistence
  const persistable = state.openFiles.filter(f => {
    if (f.content.length > MAX_FILE_SIZE) {
      warnings.push(`${f.name}: too large to persist (${Math.round(f.content.length / 1024 / 1024)}MB > 3MB)`);
      return false;
    }
    return true;
  });
  const toSave: EditorState = { ...state, openFiles: persistable };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    return { ok: true, warnings };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Drop oldest file, retry
      while (toSave.openFiles.length > 1) {
        const dropped = toSave.openFiles.shift();
        warnings.push(`Storage full — dropped ${dropped?.name} from session memory`);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
          return { ok: true, warnings };
        } catch {
          continue;
        }
      }
      // Last resort: clear and save defaults
      localStorage.removeItem(STORAGE_KEY);
      warnings.push('Storage full — session memory cleared');
      return { ok: false, warnings };
    }
    return { ok: false, warnings };
  }
}

// Hydrate eagerly at module load (browser only) so any caller of openFile()
// sees the persisted state regardless of whether Editor tab has mounted yet.
let hydrated = false;
function hydrateNow(): EditorState {
  if (typeof localStorage === 'undefined') return defaultState();
  hydrated = true;
  return loadFromStorage();
}
export const editorState = writable<EditorState>(hydrateNow());
export const persistWarnings = writable<string[]>([]);
// Transient — carries the pre-computed right-pane content from Convert/Chunk on open.
// Tied to the file ID and format it was computed for; cleared only when the user edits.
export const splitPaneInitialPreview = writable<{ fileId: string; format: string; content: string } | null>(null);

// Transient — Convert tab (and others) push a jump intent; Editor consumes once and clears.
export interface JumpIntent { fileId: string; line: number; column?: number; }
export const pendingJump = writable<JumpIntent | null>(null);

// Live selection from Editor's Monaco — Utilities reads this to seed inputs.
export interface EditorSelection { fileId: string; text: string; }
export const editorSelection = writable<EditorSelection | null>(null);

// No-op kept for backward-compat with EditorTab.svelte which calls it on mount.
export function hydrateEditorState(): void { /* hydrated at module load */ }

// Debounced save
let saveTimer: ReturnType<typeof setTimeout> | undefined;
editorState.subscribe(state => {
  if (!hydrated) return; // skip initial set in non-browser env
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const result = saveToStorage(state);
    if (result.warnings.length > 0) persistWarnings.set(result.warnings);
  }, 500);
});

// ── File operations ──────────────────────────────────────────────────────

export function openFile(name: string, content: string): string {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  editorState.update(s => ({
    ...s,
    openFiles: [...s.openFiles, { id, name, content, dirty: false }],
    activeFileId: id,
  }));
  return id;
}

export function closeFile(id: string): void {
  editorState.update(s => {
    const idx = s.openFiles.findIndex(f => f.id === id);
    if (idx < 0) return s;
    const newFiles = s.openFiles.filter(f => f.id !== id);
    let newActive = s.activeFileId;
    if (s.activeFileId === id) {
      newActive = newFiles.length > 0 ? newFiles[Math.min(idx, newFiles.length - 1)].id : null;
    }
    return { ...s, openFiles: newFiles, activeFileId: newActive };
  });
}

export function selectFile(id: string): void {
  editorState.update(s => ({ ...s, activeFileId: id }));
}

export function updateFileContent(id: string, content: string): void {
  editorState.update(s => ({
    ...s,
    openFiles: s.openFiles.map(f => f.id === id ? { ...f, content, dirty: true } : f),
  }));
}

export function markFileSaved(id: string): void {
  editorState.update(s => ({
    ...s,
    openFiles: s.openFiles.map(f => f.id === id ? { ...f, dirty: false } : f),
  }));
}

export function toggleSplitPane(): void {
  editorState.update(s => ({ ...s, splitPaneOpen: !s.splitPaneOpen }));
}

export function setSplitPaneFormat(fmt: EditorState['splitPaneFormat']): void {
  editorState.update(s => ({ ...s, splitPaneFormat: fmt }));
}

export function toggleSplitPaneOrientation(): void {
  editorState.update(s => ({
    ...s,
    splitPaneOrientation: s.splitPaneOrientation === 'vertical' ? 'horizontal' : 'vertical',
  }));
}

export function toggleBottomPanel(): void {
  editorState.update(s => ({ ...s, bottomPanelOpen: !s.bottomPanelOpen }));
}

export function setBottomPanelTab(tab: 'find' | 'linter'): void {
  editorState.update(s => ({ ...s, bottomPanelTab: tab, bottomPanelOpen: true }));
}

export function setFileReadOnly(id: string, readOnly: boolean): void {
  editorState.update(s => ({
    ...s,
    openFiles: s.openFiles.map(f => f.id === id ? { ...f, readOnly } : f),
  }));
}

export function getActiveFile(): EditorFile | null {
  const s = get(editorState);
  return s.openFiles.find(f => f.id === s.activeFileId) ?? null;
}

// Open a file and immediately enable split pane with a specific format.
// Used by Convert → Open in Editor so the source is on the left and the
// generated format renders on the right automatically.
export function openFileWithSplitPane(
  name: string,
  content: string,
  splitFormat: EditorState['splitPaneFormat'],
): string {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  editorState.update(s => ({
    ...s,
    openFiles: [...s.openFiles, { id, name, content, dirty: false }],
    activeFileId: id,
    splitPaneOpen: true,
    splitPaneFormat: splitFormat,
  }));
  return id;
}
