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
}

export const convertState = writable<ConvertState>({
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
});
