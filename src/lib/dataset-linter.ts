// Dataset auto-fix linter — produces a list of proposed fixes for the user to preview + apply.
// Each fix is a (lineIndex, before, after) tuple so the bottom panel can render a diff.

import { jsonrepair } from 'jsonrepair';

export type FixType =
  | 'trim-trailing-whitespace'
  | 'dedupe-exact'
  | 'normalize-unicode'
  | 'json-repair'
  | 'length-warning';

export interface LintFix {
  type: FixType;
  lineIndex: number;        // 0-based line in the source
  before: string;
  after: string;
  reason: string;           // human-readable explanation for the diff panel
}

export interface LintReport {
  fixes: LintFix[];
  warnings: { lineIndex: number; reason: string }[];
}

const SMART_QUOTES_RE = /[‘’‚‛“”„‟–—―…]| /;

export function lint(content: string, opts: { contextWindowTokens?: number } = {}): LintReport {
  const { contextWindowTokens } = opts;
  const lines = content.split('\n');
  const fixes: LintFix[] = [];
  const warnings: { lineIndex: number; reason: string }[] = [];

  // Pass 1 — trim trailing whitespace (per line)
  lines.forEach((line, i) => {
    const trimmed = line.replace(/[ \t]+$/, '');
    if (trimmed !== line) {
      fixes.push({
        type: 'trim-trailing-whitespace',
        lineIndex: i,
        before: line,
        after: trimmed,
        reason: 'Trailing whitespace removed',
      });
    }
  });

  // Pass 2 — exact dedupe (skip empty lines)
  const seen = new Map<string, number>(); // line content → first index where it appeared
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const key = line.trim();
    if (seen.has(key)) {
      fixes.push({
        type: 'dedupe-exact',
        lineIndex: i,
        before: line,
        after: '',
        reason: `Duplicate of line ${seen.get(key)! + 1}`,
      });
    } else {
      seen.set(key, i);
    }
  });

  // Pass 3 — normalize unicode (smart quotes, dashes, nbsp)
  lines.forEach((line, i) => {
    if (!SMART_QUOTES_RE.test(line)) return;
    const after = line
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—―]/g, '-')
      .replace(/…/g, '...')
      .replace(/ /g, ' ');
    if (after !== line) {
      fixes.push({
        type: 'normalize-unicode',
        lineIndex: i,
        before: line,
        after,
        reason: 'Smart quotes/dashes/nbsp normalized to ASCII',
      });
    }
  });

  // Pass 4 — JSON repair (only attempt on lines that look like JSON but fail to parse)
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (!line.trim().startsWith('{') && !line.trim().startsWith('[')) return;
    try {
      JSON.parse(line);
      return; // already valid
    } catch {
      // attempt repair
      try {
        const repaired = jsonrepair(line);
        // verify repaired version actually parses
        JSON.parse(repaired);
        if (repaired !== line) {
          fixes.push({
            type: 'json-repair',
            lineIndex: i,
            before: line,
            after: repaired,
            reason: 'Malformed JSON repaired',
          });
        }
      } catch {
        // jsonrepair couldn't fix it — surface as warning, not fix
        warnings.push({ lineIndex: i, reason: 'Looks like JSON but cannot be parsed or repaired' });
      }
    }
  });

  // Pass 5 — length warnings (per preset context window, if provided)
  if (contextWindowTokens && contextWindowTokens > 0) {
    // crude estimate: 4 chars per token
    const charLimit = contextWindowTokens * 4;
    lines.forEach((line, i) => {
      if (line.length > charLimit) {
        warnings.push({
          lineIndex: i,
          reason: `Line is ~${Math.round(line.length / 4)} tokens, exceeds context window of ${contextWindowTokens}`,
        });
      }
    });
  }

  return { fixes, warnings };
}

// Apply selected fixes by index (indices into the fixes array). Returns new content.
export function applyFixes(content: string, report: LintReport, selectedIndices: number[]): string {
  const lines = content.split('\n');
  const selected = new Set(selectedIndices);

  // Build a map of lineIndex → final content (or null = remove line)
  const replacements = new Map<number, string | null>();
  report.fixes.forEach((fix, idx) => {
    if (!selected.has(idx)) return;
    if (fix.type === 'dedupe-exact') {
      replacements.set(fix.lineIndex, null); // mark for removal
    } else {
      // For non-removal fixes, prefer the latest selected fix on that line
      replacements.set(fix.lineIndex, fix.after);
    }
  });

  const out: string[] = [];
  lines.forEach((line, i) => {
    if (replacements.has(i)) {
      const v = replacements.get(i);
      if (v === null) return; // skip
      out.push(v!);
    } else {
      out.push(line);
    }
  });
  return out.join('\n');
}
