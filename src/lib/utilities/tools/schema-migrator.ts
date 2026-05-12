import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export type Schema = 'chatml' | 'harmony' | 'alpaca' | 'sharegpt';

export interface MigrationResult {
  sourceSchema: Schema;
  targetSchema: Schema;
  output: string;
  recordsTransformed: number;
  recordsFailed: number;
  failures: { line: number; error: string }[];
  droppedFields: string[];
  samples: { source: string; target: string }[];
}

interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CanonicalRecord {
  messages: CanonicalMessage[];
}

// --- Canonical conversion ---

function toCanonical(record: unknown, schema: Schema): CanonicalRecord {
  const obj = record as Record<string, unknown>;
  switch (schema) {
    case 'chatml': {
      const messages = obj['messages'] as { role: string; content: string }[];
      return {
        messages: messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: String(m.content ?? ''),
        })),
      };
    }
    case 'harmony': {
      const msgs: CanonicalMessage[] = [];
      if (typeof obj['system'] === 'string' && obj['system'].length > 0) {
        msgs.push({ role: 'system', content: obj['system'] });
      }
      const rawMsgs = (obj['messages'] ?? []) as { role: string; content: string }[];
      for (const m of rawMsgs) {
        msgs.push({ role: m.role as 'system' | 'user' | 'assistant', content: String(m.content ?? '') });
      }
      return { messages: msgs };
    }
    case 'alpaca': {
      const instruction = String(obj['instruction'] ?? '');
      const input = String(obj['input'] ?? '');
      const output = String(obj['output'] ?? '');
      const msgs: CanonicalMessage[] = [];
      if (instruction.length > 0) msgs.push({ role: 'user', content: instruction });
      if (input.length > 0) msgs.push({ role: 'user', content: input });
      if (output.length > 0) msgs.push({ role: 'assistant', content: output });
      return { messages: msgs };
    }
    case 'sharegpt': {
      const convs = (obj['conversations'] ?? []) as { from: string; value: string }[];
      const roleMap: Record<string, 'system' | 'user' | 'assistant'> = {
        human: 'user',
        gpt: 'assistant',
        system: 'system',
      };
      return {
        messages: convs.map(c => ({
          role: roleMap[c.from] ?? (c.from as 'system' | 'user' | 'assistant'),
          content: String(c.value ?? ''),
        })),
      };
    }
  }
}

function fromCanonical(canonical: CanonicalRecord, schema: Schema): unknown {
  switch (schema) {
    case 'chatml': {
      return { messages: canonical.messages.map(m => ({ role: m.role, content: m.content })) };
    }
    case 'harmony': {
      const systemMsg = canonical.messages.find(m => m.role === 'system');
      const rest = canonical.messages.filter(m => m.role !== 'system');
      const result: Record<string, unknown> = { messages: rest.map(m => ({ role: m.role, content: m.content })) };
      if (systemMsg) result['system'] = systemMsg.content;
      return result;
    }
    case 'alpaca': {
      // find last user message → instruction, last assistant → output
      const userMsgs = canonical.messages.filter(m => m.role === 'user');
      const assistantMsgs = canonical.messages.filter(m => m.role === 'assistant');
      const systemMsgs = canonical.messages.filter(m => m.role === 'system');
      const systemPrefix = systemMsgs.map(m => m.content).join('\n');
      const lastUser = userMsgs[userMsgs.length - 1]?.content ?? '';
      const instruction = systemPrefix.length > 0 ? (systemPrefix + '\n' + lastUser).trim() : lastUser;
      const output = assistantMsgs[assistantMsgs.length - 1]?.content ?? '';
      return { instruction, input: '', output };
    }
    case 'sharegpt': {
      const roleMap: Record<string, string> = { user: 'human', assistant: 'gpt', system: 'system' };
      return {
        conversations: canonical.messages.map(m => ({
          from: roleMap[m.role] ?? m.role,
          value: m.content,
        })),
      };
    }
  }
}

// --- Dropped field detection ---

const CANONICAL_KEYS_BY_SCHEMA: Record<Schema, string[]> = {
  chatml: ['messages'],
  harmony: ['system', 'messages'],
  alpaca: ['instruction', 'input', 'output'],
  sharegpt: ['conversations'],
};

function collectDroppedFields(record: Record<string, unknown>, schema: Schema): string[] {
  const known = new Set(CANONICAL_KEYS_BY_SCHEMA[schema]);
  return Object.keys(record).filter(k => !known.has(k));
}

// --- Detection ---

export function detectSchema(content: string): Schema | null {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const sample = lines.slice(0, 5);
  const parsed: Record<string, unknown>[] = [];
  for (const line of sample) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) parsed.push(obj as Record<string, unknown>);
    } catch {
      // skip unparseable lines during detection
    }
  }
  if (parsed.length === 0) return null;

  // sharegpt: has conversations array with from/value items
  const sharegptScore = parsed.filter(o => {
    const convs = o['conversations'];
    return Array.isArray(convs) && convs.length > 0 && typeof (convs[0] as Record<string, unknown>)['from'] === 'string';
  }).length;

  // alpaca: has instruction + output
  const alpacaScore = parsed.filter(o => 'instruction' in o && 'output' in o).length;

  // harmony: top-level system string + messages array
  const harmonyScore = parsed.filter(o => typeof o['system'] === 'string' && Array.isArray(o['messages'])).length;

  // chatml: messages array with role/content items
  const chatmlScore = parsed.filter(o => {
    const msgs = o['messages'];
    return Array.isArray(msgs) && msgs.length > 0 && typeof (msgs[0] as Record<string, unknown>)['role'] === 'string';
  }).length;

  // Priority: sharegpt → alpaca → harmony → chatml
  const best = Math.max(sharegptScore, alpacaScore, harmonyScore, chatmlScore);
  if (best === 0) return null;
  if (sharegptScore === best) return 'sharegpt';
  if (alpacaScore === best) return 'alpaca';
  if (harmonyScore === best) return 'harmony';
  return 'chatml';
}

// --- Core migrate ---

export function migrate(content: string, source: Schema, target: Schema, preserveExtra?: boolean): MigrationResult {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const MAX_RECORDS = 10000;
  const failures: { line: number; error: string }[] = [];
  const outputLines: string[] = [];
  const droppedSet = new Set<string>();
  const samples: { source: string; target: string }[] = [];

  const truncated = lines.length > MAX_RECORDS;
  const processLines = truncated ? lines.slice(0, MAX_RECORDS) : lines;
  if (truncated) {
    failures.push({ line: MAX_RECORDS + 1, error: `Input truncated at ${MAX_RECORDS} records (${lines.length} total).` });
  }

  let recordsTransformed = 0;

  for (let i = 0; i < processLines.length; i++) {
    const raw = processLines[i];
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // collect dropped fields from source
      for (const f of collectDroppedFields(parsed, source)) droppedSet.add(f);

      const canonical = toCanonical(parsed, source);
      let out = source === target ? parsed : fromCanonical(canonical, target);
      if (preserveExtra) {
        const extra = Object.fromEntries(Object.entries(parsed).filter(([k]) => !new Set(CANONICAL_KEYS_BY_SCHEMA[source]).has(k)));
        out = { ...extra, ...(out as object) };
      }
      const outStr = JSON.stringify(out);

      outputLines.push(outStr);
      recordsTransformed++;

      if (samples.length < 5) {
        samples.push({
          source: JSON.stringify(parsed, null, 2),
          target: JSON.stringify(out, null, 2),
        });
      }
    } catch (e) {
      failures.push({ line: i + 1, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    sourceSchema: source,
    targetSchema: target,
    output: outputLines.join('\n'),
    recordsTransformed,
    recordsFailed: failures.filter(f => f.line <= MAX_RECORDS).length,
    failures,
    droppedFields: [...droppedSet],
    samples,
  };
}

const schemaMigrator: UtilityToolModule = {
  id: 'schema-migrator',
  name: 'Schema Migrator',
  category: 'data',
  run(payload: UtilityPayload): UtilityResult {
    const input = payload.input.trim();
    if (!input) return { ok: false, error: 'Input is empty.' };

    const opts = (payload.options ?? {}) as { source?: string; target?: string; preserveExtra?: boolean };
    const targetSchema = (opts.target ?? 'chatml') as Schema;
    const preserveExtra = opts.preserveExtra === true;

    let sourceSchema: Schema;
    if (!opts.source || opts.source === 'auto') {
      const detected = detectSchema(input);
      if (!detected) return { ok: false, error: 'Could not detect schema. Try specifying source manually.' };
      sourceSchema = detected;
    } else {
      sourceSchema = opts.source as Schema;
    }

    const result = migrate(input, sourceSchema, targetSchema, preserveExtra);
    return { ok: true, data: result };
  },
};

export default schemaMigrator;
