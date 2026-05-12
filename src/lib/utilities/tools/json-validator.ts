import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export type ValidatorMode = 'json' | 'jsonl' | 'auto';

export interface JsonValidatorError {
  line: number;
  column: number;
  message: string;
}

export interface JsonValidatorResult {
  valid: boolean;
  mode: 'json' | 'jsonl';
  errors: JsonValidatorError[];
  totalLines?: number;
  validLines?: number;
  parsed?: unknown;
}

function extractLineCol(err: SyntaxError, _text: string): { line: number; column: number } {
  const m = err.message.match(/line (\d+) column (\d+)/i);
  if (m) return { line: parseInt(m[1], 10), column: parseInt(m[2], 10) };
  return { line: 1, column: 1 };
}

function validateJson(text: string): JsonValidatorResult {
  try {
    const parsed = JSON.parse(text);
    return { valid: true, mode: 'json', errors: [], parsed };
  } catch (e) {
    const err = e as SyntaxError;
    const { line, column } = extractLineCol(err, text);
    return { valid: false, mode: 'json', errors: [{ line, column, message: err.message }] };
  }
}

function validateJsonl(text: string): JsonValidatorResult {
  const rawLines = text.split('\n');
  const errors: JsonValidatorError[] = [];
  let validLines = 0;
  let totalLines = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim() === '') continue;
    totalLines++;
    try {
      JSON.parse(line);
      validLines++;
    } catch (e) {
      const err = e as SyntaxError;
      errors.push({ line: i + 1, column: 1, message: err.message });
    }
  }
  return { valid: errors.length === 0, mode: 'jsonl', errors, totalLines, validLines };
}

const jsonValidator: UtilityToolModule = {
  id: 'json-validator',
  name: 'JSON / JSONL Validator',
  category: 'data',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input;
    const mode = (payload.options?.mode as ValidatorMode) ?? 'auto';

    if (text.trim() === '') {
      return { ok: false, error: 'Input is empty.' };
    }

    let resolved: 'json' | 'jsonl' = 'json';
    if (mode === 'auto') {
      const nonEmptyLines = text.trim().split('\n').filter(l => l.trim());
      const looksLikeJsonl = nonEmptyLines.length > 1 && nonEmptyLines.every(l => l.trim().startsWith('{') || l.trim().startsWith('['));
      resolved = looksLikeJsonl ? 'jsonl' : 'json';
    } else {
      resolved = mode;
    }

    const result = resolved === 'jsonl' ? validateJsonl(text) : validateJson(text);
    return { ok: true, data: result };
  },
};

export default jsonValidator;
