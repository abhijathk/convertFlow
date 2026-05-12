import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export interface TimestampResult {
  unixSeconds: number;
  iso: string;
  local: string;
  inputFormat: string;
}

function parseTimestamp(input: string): { date: Date; format: string } | null {
  const s = input.trim();
  if (!s) return null;

  // Pure numeric
  const num = Number(s);
  if (!isNaN(num) && s !== '') {
    const digits = s.replace(/\D/g, '').length;
    let ms: number;
    let format: string;
    if (digits <= 10) { ms = num * 1000; format = 'Unix seconds'; }
    else if (digits <= 13) { ms = num; format = 'Unix milliseconds'; }
    else if (digits <= 16) { ms = num / 1000; format = 'Unix microseconds'; }
    else { ms = num / 1_000_000; format = 'Unix nanoseconds'; }
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return { date: d, format };
    return null;
  }

  // ISO 8601 and other parseable strings
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const format = /^\d{4}-\d{2}-\d{2}/.test(s) ? 'ISO 8601' : 'Parseable date string';
    return { date: d, format };
  }

  return null;
}

const timestampTools: UtilityToolModule = {
  id: 'timestamp-tools',
  name: 'Timestamp Converter',
  category: 'utility',
  run(payload: UtilityPayload): UtilityResult {
    const input = payload.input.trim();
    if (!input) {
      return { ok: false, error: 'Enter a timestamp to convert.' };
    }

    const parsed = parseTimestamp(input);
    if (!parsed) {
      return { ok: false, error: 'Could not parse timestamp. Try a Unix number or ISO 8601 string.' };
    }

    const { date, format } = parsed;
    const data: TimestampResult = {
      unixSeconds: Math.floor(date.getTime() / 1000),
      iso: date.toISOString(),
      local: date.toLocaleString(),
      inputFormat: format,
    };

    return { ok: true, data };
  },
};

export default timestampTools;
