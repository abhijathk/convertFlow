import { chunkText } from './chunk';

export type ImportTemplate = 'qa' | 'context-answer' | 'instruct';

export type PromptRotationMode = 'round-robin' | 'random';

export interface MultiPromptOptions {
  prompts: string[];
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

  const prompts = multi.prompts;
  if (!prompts || prompts.length === 0) {
    throw new Error(`multi-prompt: prompt list is empty for mode ${multi.mode}`);
  }

  let rng: (() => number) | null = null;
  if (multi.mode === 'random') {
    rng = mulberry32(multi.seed ?? 42);
  }

  return chunks
    .map(({ text: chunk }, i) => {
      let prompt: string;
      if (multi.mode === 'round-robin') {
        prompt = prompts[i % prompts.length];
      } else {
        // random
        prompt = prompts[Math.floor(rng!() * prompts.length)];
      }
      return buildOneLine(template, prompt, chunk);
    })
    .join('\n');
}
