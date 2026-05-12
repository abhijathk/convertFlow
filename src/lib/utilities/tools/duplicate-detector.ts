import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export type DupMode = 'exact' | 'normalized' | 'semantic' | 'field';

export interface DupGroup {
  value: string;
  lines: number[];
  occurrences: number;
}

export interface DuplicateDetectorResult {
  total: number;
  unique: number;
  duplicates: DupGroup[];
  cappedAt: number | null;
}

function tokenSet(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\W+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) { if (b.has(t)) inter++; }
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function getFieldValue(line: string, path: string): string {
  try {
    const obj = JSON.parse(line);
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur === null || typeof cur !== 'object') return line;
      cur = (cur as Record<string, unknown>)[p];
    }
    return typeof cur === 'string' ? cur : JSON.stringify(cur);
  } catch {
    return line;
  }
}

const CAP = 200;

const duplicateDetector: UtilityToolModule = {
  id: 'duplicate-detector',
  name: 'Duplicate Detector',
  category: 'validation',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input.trim();
    if (!text) return { ok: false, error: 'Input is empty.' };

    const opts = payload.options ?? {};
    const mode = (opts['mode'] as DupMode) ?? 'exact';
    const fieldPath = (opts['fieldPath'] as string) ?? '';
    const threshold = typeof opts['threshold'] === 'number' ? (opts['threshold'] as number) : 0.85;

    const lines = text.split('\n').filter(l => l.trim() !== '');
    const total = lines.length;

    const keyMap = new Map<string, number[]>();

    if (mode === 'semantic') {
      // O(n²) Jaccard — capped at 2000 lines for perf
      const workLines = lines.slice(0, 2000);
      const sets = workLines.map(tokenSet);
      const grouped = new Array<boolean>(workLines.length).fill(false);
      const groups: Array<{ key: string; lines: number[] }> = [];

      for (let i = 0; i < workLines.length; i++) {
        if (grouped[i]) continue;
        const group: number[] = [i + 1];
        for (let j = i + 1; j < workLines.length; j++) {
          if (grouped[j]) continue;
          if (jaccard(sets[i], sets[j]) >= threshold) {
            group.push(j + 1);
            grouped[j] = true;
          }
        }
        grouped[i] = true;
        groups.push({ key: workLines[i], lines: group });
      }

      const duplicates: DupGroup[] = groups
        .filter(g => g.lines.length > 1)
        .map(g => ({ value: g.key, lines: g.lines, occurrences: g.lines.length }));

      const capped = duplicates.length > CAP;
      const data: DuplicateDetectorResult = {
        total,
        unique: groups.filter(g => g.lines.length === 1).length + groups.filter(g => g.lines.length > 1).length,
        duplicates: duplicates.slice(0, CAP),
        cappedAt: capped ? duplicates.length : null,
      };
      return { ok: true, data };
    }

    for (let i = 0; i < lines.length; i++) {
      let key: string;
      if (mode === 'normalized') key = lines[i].trim().toLowerCase();
      else if (mode === 'field') key = getFieldValue(lines[i], fieldPath);
      else key = lines[i];

      const existing = keyMap.get(key);
      if (existing) existing.push(i + 1);
      else keyMap.set(key, [i + 1]);
    }

    const duplicates: DupGroup[] = [];
    for (const [key, lineNums] of keyMap) {
      if (lineNums.length > 1) {
        duplicates.push({ value: key, lines: lineNums, occurrences: lineNums.length });
      }
    }

    const capped = duplicates.length > CAP;
    const data: DuplicateDetectorResult = {
      total,
      unique: keyMap.size,
      duplicates: duplicates.slice(0, CAP),
      cappedAt: capped ? duplicates.length : null,
    };
    return { ok: true, data };
  },
};

export default duplicateDetector;
