// Pure text-transformation helpers for the Editor tab format-action menu.
// All functions take a string, return a string. No store access, no DOM.

export function sortLines(text: string, opts: { ascending?: boolean; caseSensitive?: boolean } = {}): string {
  const { ascending = true, caseSensitive = false } = opts;
  const lines = text.split('\n');
  const sorted = [...lines].sort((a, b) => {
    const x = caseSensitive ? a : a.toLowerCase();
    const y = caseSensitive ? b : b.toLowerCase();
    if (x < y) return ascending ? -1 : 1;
    if (x > y) return ascending ? 1 : -1;
    return 0;
  });
  return sorted.join('\n');
}

export function dedupeLines(text: string, opts: { trim?: boolean } = {}): { result: string; removed: number } {
  const { trim = false } = opts;
  const lines = text.split('\n');
  const seen = new Set<string>();
  const out: string[] = [];
  let removed = 0;
  for (const line of lines) {
    const key = trim ? line.trim() : line;
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    out.push(line);
  }
  return { result: out.join('\n'), removed };
}

export function trimTrailingWhitespace(text: string): { result: string; trimmed: number } {
  const lines = text.split('\n');
  let trimmed = 0;
  const out = lines.map(line => {
    const trimmedLine = line.replace(/[ \t]+$/, '');
    if (trimmedLine !== line) trimmed++;
    return trimmedLine;
  });
  return { result: out.join('\n'), trimmed };
}

export function convertCase(text: string, mode: 'upper' | 'lower' | 'title'): string {
  if (mode === 'upper') return text.toUpperCase();
  if (mode === 'lower') return text.toLowerCase();
  // title case — capitalize first letter of each word
  return text.replace(/\b\w/g, c => c.toUpperCase());
}

export function regexReplace(
  text: string,
  pattern: string,
  replacement: string,
  opts: { flags?: string } = {}
): { result: string; matches: number } {
  const { flags = 'g' } = opts;
  try {
    const re = new RegExp(pattern, flags);
    let matches = 0;
    const result = text.replace(re, (match) => {
      matches++;
      return match.replace(re, replacement);
    });
    // Simpler replace path — re-do with a counted replacer
    const counted = text.replace(re, () => { matches++; return ''; });
    void counted;
    // Actually use a single-pass replacer that counts AND replaces
    let count = 0;
    const final = text.replace(new RegExp(pattern, flags), (m, ...rest) => {
      count++;
      // honor $1, $2, ... backrefs
      return replacement.replace(/\$(\d+)/g, (_, n) => String(rest[Number(n) - 1] ?? ''));
    });
    return { result: final, matches: count };
  } catch {
    return { result: text, matches: 0 };
  }
}

export function normalizeUnicode(text: string): { result: string; replaced: number } {
  let replaced = 0;
  const map: [RegExp, string][] = [
    [/[‘’‚‛]/g, "'"], // smart single quotes → '
    [/[“”„‟]/g, '"'], // smart double quotes → "
    [/[–—―]/g, '-'],         // en/em/horizontal dash → -
    [/…/g, '...'],                     // ellipsis → ...
    [/ /g, ' '],                       // nbsp → space
  ];
  let result = text;
  for (const [re, sub] of map) {
    result = result.replace(re, () => { replaced++; return sub; });
  }
  return { result, replaced };
}
