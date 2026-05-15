import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

// Representative phrase signatures per benchmark.
// These are distinctive multi-word phrases that appear in real benchmark samples.
// A full implementation would use pre-computed Bloom filter sketches stored in
// src/data/contamination/*.bloom.gz — this inline set covers common surface forms.

const BENCHMARK_SIGNATURES: Record<string, string[]> = {
  MMLU: [
    'the following is a multiple choice question',
    'which of the following is true',
    'which of the following best describes',
    'answer the following multiple choice question',
    'select the best answer',
    'which of the following statements is correct',
    'which of the following is not',
    'which of the following would be',
    'which option best represents',
    'answer the question by selecting',
  ],
  GSM8K: [
    'how many in all',
    'how much money does',
    'how many more',
    'how many total',
    'if she has',
    'if he has',
    'how many are left',
    'how many does he have',
    'what is the total number',
    'how many did she buy',
  ],
  HellaSwag: [
    'a man is standing in front of',
    'a person is shown holding',
    'the woman then picks up',
    'he then begins to',
    'they are shown on a',
    'a group of people are',
    'the camera pans to show',
    'she then proceeds to',
    'the video shows a person',
    'a man is seen walking',
  ],
  HumanEval: [
    'def check(candidate)',
    'from typing import list',
    'from typing import tuple',
    'from typing import optional',
    '>>> assert',
    'def solution(',
    'return sorted(',
    'pass\n    # your code here',
    'def filter_(',
    'from typing import dict',
  ],
  IFEval: [
    'your response must contain',
    'do not include',
    'your answer must be',
    'respond with only',
    'your entire response should be',
    'answer with yes or no',
    'provide a numbered list',
    'write exactly',
    'your response should not contain',
    'end your response with',
  ],
  ARC: [
    'which of these is an example of',
    'what is the main function of',
    'which property does',
    'what causes',
    'a student wants to find out',
    'what is the best explanation for',
    'what happens when',
    'which material',
    'what is the purpose of',
    'which best explains',
  ],
};

export interface ContaminationHit {
  line: number;
  benchmark: string;
  ngram: string;
}

export interface ContaminationCheckResult {
  totalRows: number;
  contaminatedRows: ContaminationHit[];
  summary: Record<string, number>;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTextFromLine(line: string): string {
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    // Extract from common field patterns
    const candidates: string[] = [];
    for (const key of ['text', 'content', 'instruction', 'input', 'output', 'question', 'answer', 'prompt', 'response']) {
      if (typeof obj[key] === 'string') candidates.push(obj[key] as string);
    }
    // Also check messages array
    if (Array.isArray(obj['messages'])) {
      for (const msg of obj['messages'] as Array<Record<string, unknown>>) {
        if (typeof msg['content'] === 'string') candidates.push(msg['content'] as string);
      }
    }
    if (Array.isArray(obj['conversations'])) {
      for (const turn of obj['conversations'] as Array<Record<string, unknown>>) {
        if (typeof turn['value'] === 'string') candidates.push(turn['value'] as string);
      }
    }
    return candidates.length > 0 ? candidates.join(' ') : line;
  } catch {
    return line;
  }
}

const contaminationCheck: UtilityToolModule = {
  id: 'contamination-check',
  name: 'Contamination Check',
  category: 'validation',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input.trim();
    if (!text) return { ok: false, error: 'Input is empty.' };

    const lines = text.split('\n').filter(l => l.trim() !== '');
    const totalRows = lines.length;

    const contaminatedRows: ContaminationHit[] = [];
    const summary: Record<string, number> = {};
    for (const bm of Object.keys(BENCHMARK_SIGNATURES)) {
      summary[bm] = 0;
    }

    const CAP = 20; // max hits to surface in UI

    for (let i = 0; i < lines.length; i++) {
      const rawText = extractTextFromLine(lines[i]);
      const normalized = normalizeText(rawText);

      for (const [benchmark, signatures] of Object.entries(BENCHMARK_SIGNATURES)) {
        for (const sig of signatures) {
          if (normalized.includes(sig)) {
            summary[benchmark]++;
            if (contaminatedRows.length < CAP) {
              contaminatedRows.push({ line: i + 1, benchmark, ngram: sig });
            }
            // Only record first matching signature per benchmark per line
            break;
          }
        }
      }
    }

    const data: ContaminationCheckResult = { totalRows, contaminatedRows, summary };
    return { ok: true, data };
  },
};

export default contaminationCheck;
