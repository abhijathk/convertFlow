import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export type CsvTsvJsonFromFormat = 'auto' | 'csv' | 'tsv' | 'json';
export type CsvTsvJsonToFormat = 'csv' | 'tsv' | 'json' | 'jsonl';

export interface CsvTsvJsonResult {
  output: string;
  detectedFrom: string;
  rowCount: number;
}

function detectFormat(text: string): 'csv' | 'tsv' | 'json' {
  const t = text.trimStart();
  if (t.startsWith('[') || t.startsWith('{')) return 'json';
  const firstLine = text.split('\n')[0] ?? '';
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  return tabCount > commaCount ? 'tsv' : 'csv';
}

function parseCsvRow(line: string, delim: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else field += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (line.slice(i, i + delim.length) === delim) { fields.push(field); field = ''; i += delim.length - 1; }
      else field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function csvToObjects(text: string, delim: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0], delim);
  return lines.slice(1).map(line => {
    const vals = parseCsvRow(line, delim);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function escapeCsvField(value: string, delim: string): string {
  if (value.includes('"') || value.includes(delim) || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function objectsToCsv(rows: Record<string, string>[], delim: string): string {
  if (rows.length === 0) return '';
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const headerLine = headers.map(h => escapeCsvField(h, delim)).join(delim);
  const dataLines = rows.map(row =>
    headers.map(h => escapeCsvField(row[h] ?? '', delim)).join(delim)
  );
  return [headerLine, ...dataLines].join('\n');
}

const csvTsvJson: UtilityToolModule = {
  id: 'csv-tsv-json',
  name: 'CSV / TSV / JSON Converter',
  category: 'data',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input.trim();
    if (!text) return { ok: false, error: 'Input is empty.' };

    const opts = payload.options ?? {};
    const fromFmt = (opts['from'] as CsvTsvJsonFromFormat) ?? 'auto';
    const toFmt = (opts['to'] as CsvTsvJsonToFormat) ?? 'jsonl';

    const detectedFrom = fromFmt === 'auto' ? detectFormat(text) : fromFmt;

    let rows: Record<string, string>[] = [];
    let rawJson: unknown = null;

    if (detectedFrom === 'csv') {
      rows = csvToObjects(text, ',');
    } else if (detectedFrom === 'tsv') {
      rows = csvToObjects(text, '\t');
    } else {
      try {
        rawJson = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: `JSON parse error: ${(e as Error).message}` };
      }
      if (Array.isArray(rawJson)) {
        rows = rawJson.map(r =>
          typeof r === 'object' && r !== null
            ? Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
            : { value: JSON.stringify(r) }
        );
      }
    }

    let output = '';
    let rowCount = 0;

    if (detectedFrom === 'json' && toFmt === 'jsonl') {
      if (Array.isArray(rawJson)) {
        output = (rawJson as unknown[]).map(r => JSON.stringify(r)).join('\n');
        rowCount = (rawJson as unknown[]).length;
      } else {
        output = JSON.stringify(rawJson);
        rowCount = 1;
      }
    } else if (toFmt === 'json') {
      output = JSON.stringify(rows, null, 2);
      rowCount = rows.length;
    } else if (toFmt === 'jsonl') {
      output = rows.map(r => JSON.stringify(r)).join('\n');
      rowCount = rows.length;
    } else if (toFmt === 'csv') {
      output = objectsToCsv(rows, ',');
      rowCount = rows.length;
    } else if (toFmt === 'tsv') {
      output = objectsToCsv(rows, '\t');
      rowCount = rows.length;
    }

    const data: CsvTsvJsonResult = { output, detectedFrom, rowCount };
    return { ok: true, data };
  },
};

export default csvTsvJson;
