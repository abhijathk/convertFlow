import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import { dedupeLines, trimTrailingWhitespace, convertCase, normalizeUnicode } from '../../text-toolkit';

export interface TextTransformerOptions {
  trim: boolean;
  dedupeLines: boolean;
  normalizeQuotes: boolean;
  removeBlankLines: boolean;
  caseMode: 'none' | 'lower' | 'upper' | 'title';
}

export interface TextTransformerResult {
  output: string;
  stats: {
    linesBefore: number;
    linesAfter: number;
    charsBefore: number;
    charsAfter: number;
  };
}

function removeBlankLines(text: string): string {
  return text.split('\n').filter(l => l.trim() !== '').join('\n');
}

const textTransformer: UtilityToolModule = {
  id: 'text-transformer',
  name: 'Text Transformer',
  category: 'text',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input;
    const opts = (payload.options ?? {}) as Partial<TextTransformerOptions>;

    const linesBefore = text === '' ? 0 : text.split('\n').length;
    const charsBefore = text.length;

    let result = text;

    if (opts.trim !== false && opts.trim) {
      const trimmed = trimTrailingWhitespace(result);
      result = trimmed.result;
    }
    if (opts.normalizeQuotes) {
      const normalized = normalizeUnicode(result);
      result = normalized.result;
    }
    if (opts.removeBlankLines) {
      result = removeBlankLines(result);
    }
    if (opts.dedupeLines) {
      const deduped = dedupeLines(result, { trim: true });
      result = deduped.result;
    }
    if (opts.caseMode && opts.caseMode !== 'none') {
      result = convertCase(result, opts.caseMode);
    }

    const linesAfter = result === '' ? 0 : result.split('\n').length;
    const charsAfter = result.length;

    const data: TextTransformerResult = {
      output: result,
      stats: { linesBefore, linesAfter, charsBefore, charsAfter },
    };

    return { ok: true, data };
  },
};

export default textTransformer;
