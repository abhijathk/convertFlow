import { writable, get } from 'svelte/store';
import { appSettings } from './appSettings';

export interface ConvertError {
  line: number;
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

export type ExportFormat = 'jsonl' | 'json' | 'csv' | 'tsv' | 'parquet' | 'md' | 'txt' | 'alpaca' | 'sharegpt';

export interface FormatSettings {
  jsonl:    { systemPrompt: string; roleUser: string; roleAssistant: string; filterIncomplete: boolean };
  json:     { indent: 2 | 4 | 0 };
  csv:      { delimiter: ',' | '\t' | '|' | ';'; header: boolean };
  tsv:      { delimiter: '\t' | ',' | '|' | ';'; header: boolean };
  parquet:  { compression: 'snappy' | 'gzip' | 'uncompressed' };
  md:       { headingLevel: 2 | 3; separator: '---' | '===' };
  txt:      { rolePrefix: 'bracket' | 'colon' | 'upper' };
  alpaca:   { systemAs: 'input' | 'ignore'; splitMultiTurn: boolean };
  sharegpt: { roleHuman: 'human' | 'user'; roleAssistant: 'gpt' | 'assistant'; includeSystem: boolean };
}

export interface DatasetFile {
  id: string;
  name: string;
  lineCount: number;
  status: 'processing' | 'done' | 'error';
  error?: string;
  content: string; // JSONL lines joined with \n (the converted output)
  rawSource?: string; // original extracted text (e.g., raw MD/PDF/DOCX before chunking)
  formatOverride?: ExportFormat | null;
}

export interface ConvertState {
  editorContent: string;
  editorDisplayOverride: string | null;
  presetId: string;
  approximateTokens: number | null;
  exactTokens: number | null;
  cost: number | null;
  errors: ConvertError[];
  lineCount: number;
  exportFormat: ExportFormat;
  formatSettings: FormatSettings;
  datasetFiles: DatasetFile[];
  // True once the user has explicitly confirmed they want to override the
  // provider/model lock that engages after data is generated. Reset to false
  // whenever the dataset is cleared.
  presetUnlocked: boolean;
}

const STORAGE_KEY = 'dataprep:convert-state-v1';

function defaultState(): ConvertState {
  return {
    editorContent: '',
    editorDisplayOverride: null,
    datasetFiles: [],
    presetId: get(appSettings).defaultPresetId,
    approximateTokens: null,
    exactTokens: null,
    cost: null,
    errors: [],
    lineCount: 0,
    exportFormat: 'jsonl',
    presetUnlocked: false,
    formatSettings: {
      jsonl:    { systemPrompt: '', roleUser: 'user', roleAssistant: 'assistant', filterIncomplete: false },
      json:     { indent: 2 },
      csv:      { delimiter: ',', header: true },
      tsv:      { delimiter: '\t', header: true },
      parquet:  { compression: 'snappy' },
      md:       { headingLevel: 2, separator: '---' },
      txt:      { rolePrefix: 'bracket' },
      alpaca:   { systemAs: 'input', splitMultiTurn: true },
      sharegpt: { roleHuman: 'human', roleAssistant: 'gpt', includeSystem: true },
    },
  };
}

function loadFromStorage(): ConvertState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ConvertState>;
    // Merge with default so a schema bump (new field) doesn't break loading.
    return {
      ...defaultState(),
      ...parsed,
      // Recomputed on next edit — don't restore stale tokens/cost/errors.
      approximateTokens: null,
      exactTokens: null,
      cost: null,
      errors: [],
      formatSettings: { ...defaultState().formatSettings, ...(parsed.formatSettings ?? {}) },
    };
  } catch {
    return defaultState();
  }
}

export const convertState = writable<ConvertState>(
  typeof localStorage !== 'undefined' ? loadFromStorage() : defaultState()
);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
convertState.subscribe(state => {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded — drop dataset file content (largest items) but keep
      // settings and the active editor content.
      try {
        const trimmed = { ...state, datasetFiles: [] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch { /* give up */ }
    }
  }, 500);
});
