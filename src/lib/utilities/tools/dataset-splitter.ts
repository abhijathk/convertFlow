import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import seedrandom from 'seedrandom';

export interface DatasetSplitterOptions {
  trainPct: number;
  valPct: number;
  testPct: number;
  seed: string;
}

export interface DatasetSplitterResult {
  train: string;
  val: string;
  test: string;
  counts: { train: number; val: number; test: number };
}

const datasetSplitter: UtilityToolModule = {
  id: 'dataset-splitter',
  name: 'Dataset Splitter',
  category: 'data',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input.trim();
    const opts = (payload.options ?? {}) as Partial<DatasetSplitterOptions>;
    const trainPct = opts.trainPct ?? 80;
    const valPct = opts.valPct ?? 10;
    const testPct = opts.testPct ?? 10;

    if (Math.round(trainPct + valPct + testPct) !== 100) {
      return { ok: false, error: `Percentages must sum to 100 (got ${trainPct + valPct + testPct})` };
    }

    if (!text) return { ok: false, error: 'Input is empty.' };

    const lines = text.split('\n').filter(l => l.trim() !== '');
    const n = lines.length;

    const rng = opts.seed ? seedrandom(opts.seed) : Math.random;
    const shuffled = [...lines];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const trainEnd = Math.floor(n * trainPct / 100);
    const valEnd = trainEnd + Math.floor(n * valPct / 100);

    const trainLines = shuffled.slice(0, trainEnd);
    const valLines = shuffled.slice(trainEnd, valEnd);
    const testLines = shuffled.slice(valEnd);

    const data: DatasetSplitterResult = {
      train: trainLines.join('\n'),
      val: valLines.join('\n'),
      test: testLines.join('\n'),
      counts: { train: trainLines.length, val: valLines.length, test: testLines.length },
    };

    return { ok: true, data };
  },
};

export default datasetSplitter;
