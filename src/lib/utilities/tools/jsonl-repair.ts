import type { UtilityPayload, UtilityResult, UtilityToolModule } from '../types';

export interface LineRepair {
  lineNum: number;
  original: string;
  repaired: string;
  fixes: string[];
  status: 'ok' | 'repaired' | 'failed';
}

export interface JsonlRepairResult {
  output: string;
  stats: { total: number; ok: number; repaired: number; failed: number };
  lines: LineRepair[];
}

function repairLine(raw: string, lineNum: number): LineRepair {
  const original = raw;
  const fixes: string[] = [];
  let s = raw;

  // Strip BOM on first line
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1);
    fixes.push('removed BOM');
  }

  // Strip JSONC comments before any structural check
  const stripped = stripComments(s);
  if (stripped !== s) {
    s = stripped;
    fixes.push('stripped comments');
  }

  // Try parsing before any repairs
  try {
    JSON.parse(s);
    return { lineNum, original, repaired: s, fixes, status: fixes.length ? 'repaired' : 'ok' };
  } catch { /* proceed to repairs */ }

  // Trailing comma before } or ]
  const noTrailing = s.replace(/,(\s*[}\]])/g, '$1');
  if (noTrailing !== s) {
    s = noTrailing;
    fixes.push('removed trailing commas');
  }

  // Single-quoted strings → double-quoted (naive: swap unescaped single quotes)
  if (/(?<![\\])'/g.test(s)) {
    try {
      const dq = singleToDouble(s);
      JSON.parse(dq);
      s = dq;
      fixes.push('converted single quotes');
    } catch { /* not fixable this way */ }
  }

  // Unescaped control characters (0x00–0x1F except \t \n \r)
  const noControl = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  if (noControl !== s) {
    s = noControl;
    fixes.push('removed control characters');
  }

  // Try after accumulated repairs
  try {
    JSON.parse(s);
    return { lineNum, original, repaired: s, fixes, status: fixes.length ? 'repaired' : 'ok' };
  } catch { /* proceed to truncation recovery */ }

  // Truncated object/array — try auto-close
  const closed = tryClose(s);
  if (closed !== s) {
    try {
      JSON.parse(closed);
      s = closed;
      fixes.push('auto-closed truncated structure');
      return { lineNum, original, repaired: s, fixes, status: 'repaired' };
    } catch { /* still broken */ }
  }

  return { lineNum, original, repaired: s, fixes, status: 'failed' };
}

function stripComments(s: string): string {
  // Remove /* ... */ and // ... to end-of-string
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/m, '')
    .trim();
}

function singleToDouble(s: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const prev = s[i - 1];
    if (ch === '"' && !inSingle && prev !== '\\') { inDouble = !inDouble; out += ch; continue; }
    if (ch === "'" && !inDouble) {
      if (prev !== '\\') inSingle = !inSingle;
      out += inSingle || prev === '\\' ? '"' : '"';
      continue;
    }
    out += ch;
  }
  return out;
}

function tryClose(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"' && !escape) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (!stack.length) return s;
  // Drop trailing incomplete string value if any
  let close = s.replace(/:\s*"[^"]*$/, ': null');
  return close + stack.reverse().join('');
}

function run(payload: UtilityPayload): UtilityResult {
  const raw = payload.input ?? '';
  if (!raw.trim()) return { ok: false, error: 'No input provided.' };

  const keepFailed = payload.options?.keepFailed === true;

  // Normalize line endings and strip BOM from the whole input first
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rawLines = text.split('\n');
  const nonEmpty = rawLines.filter(l => l.trim() !== '');

  if (!nonEmpty.length) return { ok: false, error: 'Input contains no non-empty lines.' };

  const lines: LineRepair[] = [];
  let lineNum = 0;

  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    lineNum++;
    lines.push(repairLine(raw, lineNum));
  }

  const stats = {
    total: lines.length,
    ok: lines.filter(l => l.status === 'ok').length,
    repaired: lines.filter(l => l.status === 'repaired').length,
    failed: lines.filter(l => l.status === 'failed').length,
  };

  const output = lines
    .filter(l => l.status !== 'failed' || keepFailed)
    .map(l => l.repaired)
    .join('\n') + '\n';

  return { ok: true, data: { output, stats, lines } satisfies JsonlRepairResult };
}

const jsonlRepair: UtilityToolModule = {
  id: 'jsonl-repair',
  name: 'JSONL Repair',
  category: 'data',
  run,
};

export default jsonlRepair;
