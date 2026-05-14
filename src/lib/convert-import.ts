import { chunkText } from './chunk';

export type ImportTemplate = 'qa' | 'context-answer' | 'instruct';

export type PromptRotationMode = 'round-robin' | 'random' | 'pool-by-template';

export interface MultiPromptOptions {
  // For 'round-robin' and 'random': flat list of prompts cycled across chunks.
  prompts?: string[];
  // For 'pool-by-template': each template id maps to its own list of prompts.
  promptPools?: Partial<Record<ImportTemplate, string[]>>;
  mode: PromptRotationMode;
  seed?: number; // only used when mode === 'random' (defaults to 42 if absent)
}

// Deterministic PRNG — mulberry32
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildOneLine(template: ImportTemplate, prompt: string, chunkText: string): string {
  if (template === 'qa') {
    return JSON.stringify({
      messages: [
        { role: 'system', content: prompt || 'You are a helpful assistant.' },
        { role: 'user', content: chunkText },
        { role: 'assistant', content: '' },
      ],
    });
  }
  if (template === 'context-answer') {
    return JSON.stringify({
      messages: [
        { role: 'system', content: `Answer using the following context.\n\nContext:\n${chunkText}` },
        { role: 'user', content: '' },
        { role: 'assistant', content: '' },
      ],
    });
  }
  // instruct (alpaca-style)
  return JSON.stringify({
    instruction: prompt || 'Summarize the following passage.',
    input: chunkText,
    output: '',
  });
}

export function fileToConversationalJsonl(
  text: string,
  template: ImportTemplate,
  systemPrompt: string,
  chunkSize: number
): string {
  const chunks = chunkText(text, 'fixed', { maxTokens: chunkSize, overlap: 0 });

  return chunks
    .filter(c => c.text.trim().length > 0)
    .map(({ text: chunk }) => buildOneLine(template, systemPrompt, chunk))
    .join('\n');
}

export function fileToConversationalJsonlMulti(
  text: string,
  template: ImportTemplate,
  multi: MultiPromptOptions,
  chunkSize: number,
): string {
  const chunks = chunkText(text, 'fixed', { maxTokens: chunkSize, overlap: 0 })
    .filter(c => c.text.trim().length > 0);

  // Resolve the prompt list for this mode up front (except pool — resolved per chunk).
  let prompts: string[] = [];
  let rng: (() => number) | null = null;

  if (multi.mode === 'pool-by-template') {
    const pool = multi.promptPools?.[template];
    if (!pool || pool.length === 0) {
      throw new Error(`multi-prompt: prompt list is empty for mode pool-by-template (template: ${template})`);
    }
    prompts = pool;
  } else {
    prompts = multi.prompts ?? [];
    if (prompts.length === 0) {
      throw new Error(`multi-prompt: prompt list is empty for mode ${multi.mode}`);
    }
    if (multi.mode === 'random') {
      rng = mulberry32(multi.seed ?? 42);
    }
  }

  return chunks
    .map(({ text: chunk }, i) => {
      let prompt: string;
      if (multi.mode === 'round-robin' || multi.mode === 'pool-by-template') {
        prompt = prompts[i % prompts.length];
      } else {
        // random
        prompt = prompts[Math.floor(rng!() * prompts.length)];
      }
      return buildOneLine(template, prompt, chunk);
    })
    .join('\n');
}
