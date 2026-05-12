import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export type ConvSchema = 'openai' | 'anthropic' | 'alpaca' | 'sharegpt';

export interface ConversationFormatterResult {
  output: string;
  conversationCount: number;
  messageCount: number;
}

interface Msg { role: string; content: string }

const ROLE_RE = /^(User|Human|Assistant|AI|Bot|System)\s*:/i;

const ROLE_MAP: Record<string, string> = {
  user: 'user', human: 'user',
  assistant: 'assistant', ai: 'assistant', bot: 'assistant',
  system: 'system',
};

function parseBlock(block: string): Msg[] {
  const lines = block.split('\n');
  const messages: Msg[] = [];
  let currentRole = '';
  let currentContent: string[] = [];

  function flush() {
    if (currentRole && currentContent.join('').trim()) {
      messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
    }
    currentContent = [];
  }

  for (const line of lines) {
    const m = line.match(ROLE_RE);
    if (m) {
      flush();
      currentRole = ROLE_MAP[m[1].toLowerCase()] ?? 'user';
      currentContent.push(line.slice(m[0].length).trim());
    } else {
      currentContent.push(line);
    }
  }
  flush();
  return messages;
}

function toOpenAI(msgs: Msg[]): string {
  return JSON.stringify({ messages: msgs });
}

function toAnthropic(msgs: Msg[]): string {
  const system = msgs.find(m => m.role === 'system');
  const conv = msgs.filter(m => m.role !== 'system');
  const obj: Record<string, unknown> = { messages: conv };
  if (system) obj['system'] = system.content;
  return JSON.stringify(obj);
}

function toAlpaca(msgs: Msg[]): string {
  const system = msgs.find(m => m.role === 'system');
  const turns = msgs.filter(m => m.role !== 'system');
  const results: string[] = [];
  for (let i = 0; i < turns.length - 1; i += 2) {
    const instruction = turns[i]?.content ?? '';
    const output = turns[i + 1]?.content ?? '';
    const obj: Record<string, string> = { instruction, output };
    if (system) obj['input'] = system.content;
    results.push(JSON.stringify(obj));
  }
  return results.join('\n');
}

function toShareGPT(msgs: Msg[]): string {
  const conversations = msgs.map(m => ({
    from: m.role === 'user' ? 'human' : m.role === 'system' ? 'system' : 'gpt',
    value: m.content,
  }));
  return JSON.stringify({ conversations });
}

const conversationFormatter: UtilityToolModule = {
  id: 'conversation-formatter',
  name: 'Conversation Formatter',
  category: 'text',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input.trim();
    if (!text) return { ok: false, error: 'Input is empty.' };

    const opts = payload.options ?? {};
    const schema = (opts['schema'] as ConvSchema) ?? 'openai';

    const blocks = text.split(/\n{2,}/).filter(b => b.trim());
    const outputLines: string[] = [];
    let messageCount = 0;

    for (const block of blocks) {
      const msgs = parseBlock(block);
      if (msgs.length === 0) continue;
      messageCount += msgs.length;

      let line = '';
      if (schema === 'openai') line = toOpenAI(msgs);
      else if (schema === 'anthropic') line = toAnthropic(msgs);
      else if (schema === 'alpaca') line = toAlpaca(msgs);
      else if (schema === 'sharegpt') line = toShareGPT(msgs);

      if (line.trim()) outputLines.push(line);
    }

    const data: ConversationFormatterResult = {
      output: outputLines.join('\n'),
      conversationCount: outputLines.length,
      messageCount,
    };
    return { ok: true, data };
  },
};

export default conversationFormatter;
