// Local-LLM synthetic data generation via the Magpie technique
// (https://arxiv.org/abs/2406.08464). We send the aligned model only a
// pre-query template and let it generate a user query, then re-send that
// query to capture the response. Output is OpenAI-style JSONL rows.
//
// V1 uses Ollama's /api/chat endpoint (also compatible with LM Studio and
// llama.cpp's server) with a "generate a diverse user query" system prompt.
// This produces functionally equivalent output to strict Magpie without
// needing raw template manipulation.

export interface MagpieRow {
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface MagpieOptions {
  endpoint: string;
  model: string;
  count: number;
  signal?: AbortSignal;
  onRow?: (row: MagpieRow, index: number) => void;
  onError?: (error: string, index: number) => void;
  topic?: string; // optional steering hint
}

export interface MagpieResult {
  rows: MagpieRow[];
  failedCount: number;
}

const QUERY_SEED_PROMPTS = [
  'Generate one diverse, complex user query that someone might ask an AI assistant. Output only the query — no preamble, no quotes, no formatting.',
  'Compose one realistic user question on a topic of your choosing. Vary the style — sometimes a question, sometimes a request, sometimes an instruction. Output only the user message.',
  'Imagine a user with a specific real-world problem. Write the single message they would send to an AI assistant. Output only that message.',
  'Generate one user request that asks for help with code, writing, planning, analysis, or learning. Be specific. Output only the request.',
];

function pickPrompt(topic: string | undefined, index: number): string {
  const base = QUERY_SEED_PROMPTS[index % QUERY_SEED_PROMPTS.length];
  if (!topic) return base;
  return `${base} The topic should relate to: ${topic}.`;
}

async function chat(endpoint: string, model: string, messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  const url = `${endpoint.replace(/\/$/, '')}/api/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json() as { message?: { content?: string }; error?: string };
  if (data.error) throw new Error(data.error);
  const content = data.message?.content?.trim();
  if (!content) throw new Error('Empty response from model');
  return content;
}

export async function generateMagpie(opts: MagpieOptions): Promise<MagpieResult> {
  const { endpoint, model, count, signal, onRow, onError, topic } = opts;
  const rows: MagpieRow[] = [];
  let failedCount = 0;

  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;

    try {
      const query = await chat(endpoint, model, [
        { role: 'user', content: pickPrompt(topic, i) },
      ], signal);

      // Strip common preamble artifacts the model may add
      const cleanQuery = query
        .replace(/^(Sure!?\s+|Here'?s? (?:is )?(?:one|a|an?) ?(?:diverse|user|complex|query|question|request)?[:.]?\s+)/i, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim();

      if (!cleanQuery || cleanQuery.length < 5) {
        failedCount++;
        onError?.('Query too short', i);
        continue;
      }

      const response = await chat(endpoint, model, [
        { role: 'user', content: cleanQuery },
      ], signal);

      const row: MagpieRow = {
        messages: [
          { role: 'user', content: cleanQuery },
          { role: 'assistant', content: response },
        ],
      };
      rows.push(row);
      onRow?.(row, i);
    } catch (err) {
      failedCount++;
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg, i);
      if (signal?.aborted) break;
    }
  }

  return { rows, failedCount };
}

export function rowToJsonl(row: MagpieRow): string {
  return JSON.stringify(row);
}
