import { jsonrepair } from 'jsonrepair';
import type { ValidationError } from './validate';

export interface AutoFix {
  label: string;
  apply: (content: string) => string;
}

const ROLE_ALIASES: Record<string, string> = {
  human: 'user',
  ai: 'assistant',
  bot: 'assistant',
  gpt: 'assistant',
  chatgpt: 'assistant',
  model: 'assistant',
};

function replaceLine(content: string, lineIndex: number, newLine: string): string {
  const lines = content.split('\n');
  lines[lineIndex] = newLine;
  return lines.join('\n');
}

function removeLine(content: string, lineIndex: number): string {
  const lines = content.split('\n');
  lines.splice(lineIndex, 1);
  return lines.join('\n');
}

export function suggestFix(content: string, err: ValidationError): AutoFix | null {
  const lineIndex = err.line - 1;
  const lines = content.split('\n');

  if (lineIndex < 0 || lineIndex >= lines.length) return null;

  const raw = lines[lineIndex];

  // Empty line in middle of content — strip it
  if (err.code === 'invalid_json' && !raw.trim()) {
    return {
      label: 'remove empty line',
      apply: (c) => removeLine(c, lineIndex),
    };
  }

  // invalid_json — attempt jsonrepair on the line
  if (err.code === 'invalid_json') {
    try {
      const repaired = jsonrepair(raw);
      JSON.parse(repaired); // verify it's valid after repair
      return {
        label: 'repair JSON',
        apply: (c) => replaceLine(c, lineIndex, repaired),
      };
    } catch {
      return null;
    }
  }

  // missing_required_field "messages" — line is {role, content} bare object → wrap it
  if (err.code === 'missing_required_field' && err.field === 'messages') {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if ('role' in obj && 'content' in obj) {
        const wrapped = JSON.stringify({ messages: [obj] });
        return {
          label: 'wrap in messages',
          apply: (c) => replaceLine(c, lineIndex, wrapped),
        };
      }
      // Add an empty messages array so the line becomes structurally valid
      const fixed = JSON.stringify({ ...obj, messages: [] });
      return {
        label: 'add messages field',
        apply: (c) => replaceLine(c, lineIndex, fixed),
      };
    } catch {
      return null;
    }
  }

  // invalid_role — remap known aliases or map to first allowed role
  if (err.code === 'invalid_role') {
    // Extract the bad role from the message: messages[N].role "badRole"
    const roleMatch = err.message.match(/\.role "([^"]+)"/);
    if (!roleMatch) return null;
    const badRole = roleMatch[1];

    // Extract allowed roles from the message: expected "a" | "b" | ...
    const expectedMatch = err.message.match(/expected (.+)$/);
    const allowedRoles: string[] = [];
    if (expectedMatch) {
      const raw2 = expectedMatch[1];
      const matches = raw2.match(/"([^"]+)"/g);
      if (matches) matches.forEach(m => allowedRoles.push(m.replace(/"/g, '')));
    }

    const mapped = ROLE_ALIASES[badRole.toLowerCase()];
    const replacement = mapped && (allowedRoles.length === 0 || allowedRoles.includes(mapped))
      ? mapped
      : allowedRoles[0];

    if (!replacement) return null;

    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const messages = obj['messages'];
      if (!Array.isArray(messages)) return null;

      const newMessages = messages.map((msg: unknown) => {
        const m = msg as Record<string, unknown>;
        if (m.role === badRole) return { ...m, role: replacement };
        return m;
      });
      const fixed = JSON.stringify({ ...obj, messages: newMessages });
      return {
        label: `role "${badRole}" → "${replacement}"`,
        apply: (c) => replaceLine(c, lineIndex, fixed),
      };
    } catch {
      return null;
    }
  }

  // missing_content — add "content": "" to the affected message
  if (err.code === 'missing_content') {
    // field is messages[N].content — extract N
    const idxMatch = err.field.match(/messages\[(\d+)\]/);
    if (!idxMatch) return null;
    const msgIdx = parseInt(idxMatch[1], 10);

    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const messages = obj['messages'];
      if (!Array.isArray(messages)) return null;

      const newMessages = messages.map((msg: unknown, i: number) => {
        if (i !== msgIdx) return msg;
        const m = msg as Record<string, unknown>;
        return { ...m, content: '' };
      });
      const fixed = JSON.stringify({ ...obj, messages: newMessages });
      return {
        label: 'add missing content',
        apply: (c) => replaceLine(c, lineIndex, fixed),
      };
    } catch {
      return null;
    }
  }

  // missing_role — add "role": "user" to the affected message
  if (err.code === 'missing_role') {
    const idxMatch = err.field.match(/messages\[(\d+)\]/);
    if (!idxMatch) return null;
    const msgIdx = parseInt(idxMatch[1], 10);

    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const messages = obj['messages'];
      if (!Array.isArray(messages)) return null;

      const newMessages = messages.map((msg: unknown, i: number) => {
        if (i !== msgIdx) return msg;
        const m = msg as Record<string, unknown>;
        return { role: 'user', ...m };
      });
      const fixed = JSON.stringify({ ...obj, messages: newMessages });
      return {
        label: 'add missing role',
        apply: (c) => replaceLine(c, lineIndex, fixed),
      };
    } catch {
      return null;
    }
  }

  // forbidden_field — remove the field
  if (err.code === 'forbidden_field') {
    const fieldName = err.field;
    if (!fieldName) return null;
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const { [fieldName]: _removed, ...rest } = obj;
      const fixed = JSON.stringify(rest);
      return {
        label: `remove "${fieldName}"`,
        apply: (c) => replaceLine(c, lineIndex, fixed),
      };
    } catch {
      return null;
    }
  }

  return null;
}
