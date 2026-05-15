import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import seedrandom from 'seedrandom';

export interface DatasetSplitterOptions {
  trainPct: number;
  valPct: number;
  testPct: number;
  seed: string;
  stratifyBy?: 'none' | 'role-mix' | 'length-bucket' | 'system-prompt';
  leakageCheck?: boolean;
}

export interface LeakageResult {
  trainTestPairs: { trainLine: number; testLine: number; ngram: string }[];
  sampledOnly: boolean;
}

export interface DatasetSplitterResult {
  train: string;
  val: string;
  test: string;
  counts: { train: number; val: number; test: number };
  leakage?: LeakageResult;
}

// ── Seeded shuffle (Fisher-Yates) ────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Bucket-key extractors ─────────────────────────────────────────────────────

function roleMixKey(line: string): string {
  try {
    const obj = JSON.parse(line) as { messages?: { role?: string }[] };
    if (Array.isArray(obj.messages)) {
      return obj.messages.map(m => m.role ?? 'other').join(',');
    }
  } catch { /* fall through */ }
  return '__no-messages__';
}

function lengthBucketKey(line: string): string {
  const len = line.length;
  if (len < 200)  return 'q1';
  if (len < 500)  return 'q2';
  if (len < 1200) return 'q3';
  return 'q4';
}

function systemPromptKey(line: string): string {
  try {
    const obj = JSON.parse(line) as { messages?: { role?: string; content?: string }[] };
    if (Array.isArray(obj.messages)) {
      const sys = obj.messages.find(m => m.role === 'system');
      if (sys?.content) return sys.content.slice(0, 120);
    }
  } catch { /* fall through */ }
  return '__no-system__';
}

// ── Stratified split ─────────────────────────────────────────────────────────

function stratifiedSplit(
  lines: string[],
  trainPct: number,
  valPct: number,
  testPct: number,
  keyFn: (line: string) => string,
  rng: () => number,
): { train: string[]; val: string[]; test: string[] } {
  // Group lines by bucket key
  const buckets = new Map<string, string[]>();
  for (const line of lines) {
    const key = keyFn(line);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(line);
  }

  const trainLines: string[] = [];
  const valLines:   string[] = [];
  const testLines:  string[] = [];

  for (const bucket of buckets.values()) {
    const shuffled = shuffle(bucket, rng);
    const n = shuffled.length;
    const trainEnd = Math.floor(n * trainPct / 100);
    const valEnd   = trainEnd + Math.floor(n * valPct / 100);
    trainLines.push(...shuffled.slice(0, trainEnd));
    valLines.push(  ...shuffled.slice(trainEnd, valEnd));
    testLines.push( ...shuffled.slice(valEnd));
  }

  return { train: trainLines, val: valLines, test: testLines };
}

// ── Leakage check (13-gram overlap) ─────────────────────────────────────────

const LEAKAGE_CAP = 10_000;

function ngrams13(text: string): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const result = new Set<string>();
  for (let i = 0; i + 12 < words.length; i++) {
    result.add(words.slice(i, i + 13).join(' '));
  }
  return result;
}

function checkLeakage(
  trainLines: string[],
  evalLines: string[],
): LeakageResult {
  const totalPairs = trainLines.length * evalLines.length;
  const sampledOnly = totalPairs > LEAKAGE_CAP;

  // Build 13-gram sets for each train line
  const trainNgrams: Array<{ lineNum: number; grams: Set<string> }> = trainLines.map(
    (line, i) => ({ lineNum: i + 1, grams: ngrams13(line) })
  );

  const pairs: LeakageResult['trainTestPairs'] = [];

  let checked = 0;
  outer: for (let ei = 0; ei < evalLines.length; ei++) {
    const evalGrams = ngrams13(evalLines[ei]);
    if (evalGrams.size === 0) continue;
    for (let ti = 0; ti < trainNgrams.length; ti++) {
      if (sampledOnly && checked >= LEAKAGE_CAP) break outer;
      const { lineNum: trainLine, grams } = trainNgrams[ti];
      for (const gram of evalGrams) {
        if (grams.has(gram)) {
          pairs.push({ trainLine, testLine: ei + 1, ngram: gram });
          checked++;
          break; // one match per (train, eval) pair is enough
        }
      }
      if (!sampledOnly) checked++;
    }
  }

  return { trainTestPairs: pairs, sampledOnly };
}

// ── Tool module ───────────────────────────────────────────────────────────────

const datasetSplitter: UtilityToolModule = {
  id: 'dataset-splitter',
  name: 'Dataset Splitter',
  category: 'data',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input.trim();
    const opts = (payload.options ?? {}) as Partial<DatasetSplitterOptions>;
    const trainPct   = opts.trainPct ?? 80;
    const valPct     = opts.valPct   ?? 10;
    const testPct    = opts.testPct  ?? 10;
    const stratifyBy = opts.stratifyBy ?? 'none';
    const doLeakage  = opts.leakageCheck !== false; // default true

    if (Math.round(trainPct + valPct + testPct) !== 100) {
      return { ok: false, error: `Percentages must sum to 100 (got ${trainPct + valPct + testPct})` };
    }

    if (!text) return { ok: false, error: 'Input is empty.' };

    const lines = text.split('\n').filter(l => l.trim() !== '');
    const n = lines.length;

    // Seed: use opts.seed if provided; fall back to a fixed string so stratified
    // mode is always reproducible when no seed is given.
    const seedStr = opts.seed || (stratifyBy !== 'none' ? 'convertflow-default' : '');
    const rng: () => number = seedStr ? seedrandom(seedStr) : Math.random;

    let trainLines: string[];
    let valLines:   string[];
    let testLines:  string[];

    if (stratifyBy === 'none') {
      const shuffled = shuffle(lines, rng);
      const trainEnd = Math.floor(n * trainPct / 100);
      const valEnd   = trainEnd + Math.floor(n * valPct / 100);
      trainLines = shuffled.slice(0, trainEnd);
      valLines   = shuffled.slice(trainEnd, valEnd);
      testLines  = shuffled.slice(valEnd);
    } else {
      const keyFn =
        stratifyBy === 'role-mix'      ? roleMixKey :
        stratifyBy === 'length-bucket' ? lengthBucketKey :
                                         systemPromptKey;

      const splits = stratifiedSplit(lines, trainPct, valPct, testPct, keyFn, rng);
      trainLines = splits.train;
      valLines   = splits.val;
      testLines  = splits.test;
    }

    let leakage: LeakageResult | undefined;
    if (doLeakage) {
      const evalLines = [...valLines, ...testLines];
      if (trainLines.length > 0 && evalLines.length > 0) {
        leakage = checkLeakage(trainLines, evalLines);
      }
    }

    const data: DatasetSplitterResult = {
      train: trainLines.join('\n'),
      val:   valLines.join('\n'),
      test:  testLines.join('\n'),
      counts: { train: trainLines.length, val: valLines.length, test: testLines.length },
      leakage,
    };

    return { ok: true, data };
  },
};

export default datasetSplitter;
