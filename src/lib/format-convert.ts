import type { FormatSettings } from '../stores/convertState';

export type ExportFormat = 'jsonl' | 'json' | 'csv' | 'tsv' | 'parquet' | 'md' | 'txt' | 'alpaca' | 'sharegpt';

// ── Helpers ─────────────────────────────────────────────────────────────────

export function extractMessages(obj: Record<string, unknown>): { role: string; content: string }[] {
  const msgs = obj.messages ?? obj.turns ?? obj.conversations;
  if (Array.isArray(msgs)) {
    return msgs.map((m: Record<string, unknown>) => ({
      role: String(m.role ?? m.from ?? 'unknown'),
      content: String(m.content ?? m.text ?? m.value ?? ''),
    }));
  }
  return [];
}

export function csvEscape(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

// Parsed-chunk detection: returns chunks if every line is {chunk_index, content}, else null.
export function asChunks(content: string): { chunk_index: number; content: string }[] | null {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return null;
  const out: { chunk_index: number; content: string }[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (typeof obj.chunk_index !== 'number' || typeof obj.content !== 'string' || obj.messages) {
        return null;
      }
      out.push({ chunk_index: obj.chunk_index, content: obj.content });
    } catch {
      return null;
    }
  }
  return out;
}

// ── Main conversion ────────────────────────────────────────────────────────
// Pure function — takes content + format + settings, returns string.
// Parquet returns empty (binary handled separately by caller).

export function buildExportContent(content: string, format: ExportFormat, settings: FormatSettings): string {
  const lines = content.split('\n').filter(l => l.trim());

  if (format === 'jsonl') {
    const { systemPrompt, roleUser, roleAssistant, filterIncomplete } = settings.jsonl;
    const noOp = !systemPrompt && roleUser === 'user' && roleAssistant === 'assistant' && !filterIncomplete;
    if (noOp) {
      // Only short-circuit when the source is already JSONL-shaped.
      const sample = lines.slice(0, 3);
      const isJsonl = sample.length > 0 && sample.every(l => {
        try { const o = JSON.parse(l); return typeof o === 'object' && o !== null; } catch { return false; }
      });
      if (isJsonl) return content;
      // Non-JSONL source (e.g. MD edited live) — wrap as a single chat turn.
      return JSON.stringify({ messages: [{ role: 'user', content: content.trim() }, { role: 'assistant', content: '' }] });
    }

    const processed = lines.flatMap(line => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const msgs = extractMessages(obj);
        if (msgs.length === 0) return filterIncomplete ? [] : [line];

        const renamed = msgs.map(m => ({
          role: m.role === 'user' ? roleUser
              : m.role === 'assistant' ? roleAssistant
              : m.role,
          content: m.content,
        }));

        if (filterIncomplete && renamed[renamed.length - 1].role !== roleAssistant) return [];

        let final = renamed;
        if (systemPrompt && !renamed.some(m => m.role === 'system')) {
          final = [{ role: 'system', content: systemPrompt }, ...renamed];
        }

        const fieldName = Array.isArray(obj.messages) ? 'messages'
          : Array.isArray((obj as Record<string, unknown>).turns) ? 'turns'
          : Array.isArray((obj as Record<string, unknown>).conversations) ? 'conversations'
          : 'messages';

        return [JSON.stringify({ ...obj, [fieldName]: final })];
      } catch {
        return filterIncomplete ? [] : [line];
      }
    });
    return processed.join('\n');
  }

  if (format === 'json') {
    const objects = lines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
    const { indent } = settings.json;
    return JSON.stringify(objects, null, indent === 0 ? undefined : indent);
  }

  if (format === 'csv' || format === 'tsv') {
    const fmtSettings = format === 'tsv' ? settings.tsv : settings.csv;
    const { delimiter, header } = fmtSettings;
    const chunks = asChunks(content);
    if (chunks) {
      const rows: string[] = header ? [`chunk_index${delimiter}content`] : [];
      chunks.forEach(c => rows.push([String(c.chunk_index), csvEscape(c.content)].join(delimiter)));
      return rows.join('\n');
    }
    const rows: string[] = header
      ? [`example_id${delimiter}turn${delimiter}role${delimiter}content`]
      : [];
    lines.forEach((line, exIdx) => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const msgs = extractMessages(obj);
        msgs.forEach((m, turnIdx) => {
          rows.push([String(exIdx), String(turnIdx), csvEscape(m.role), csvEscape(m.content)].join(delimiter));
        });
        if (msgs.length === 0) {
          rows.push([String(exIdx), '0', csvEscape('unknown'), csvEscape(line)].join(delimiter));
        }
      } catch {
        rows.push([String(exIdx), '0', csvEscape('unknown'), csvEscape(line)].join(delimiter));
      }
    });
    return rows.join('\n');
  }

  if (format === 'parquet') return '';

  if (format === 'md') {
    const { headingLevel, separator } = settings.md;
    const hashes = '#'.repeat(headingLevel);
    const chunks = asChunks(content);
    if (chunks) {
      return chunks.map(c => `${hashes} Section ${c.chunk_index + 1}\n\n${c.content}`).join(`\n\n${separator}\n\n`);
    }
    return lines.map((line, i) => {
      try {
        const obj = JSON.parse(line);
        const msgs = extractMessages(obj);
        if (msgs.length === 0) return `${hashes} Example ${i + 1}\n\n\`\`\`json\n${line}\n\`\`\``;
        const body = msgs.map(m => `**${m.role}:** ${m.content}`).join('\n\n');
        return `${hashes} Example ${i + 1}\n\n${body}`;
      } catch {
        return `${hashes} Example ${i + 1}\n\n\`\`\`\n${line}\n\`\`\``;
      }
    }).join(`\n\n${separator}\n\n`);
  }

  if (format === 'txt') {
    const { rolePrefix } = settings.txt;
    const chunks = asChunks(content);
    if (chunks) {
      return chunks.map(c => `=== Section ${c.chunk_index + 1} ===\n${c.content}`).join('\n\n');
    }
    const makePrefix = (r: string): string => {
      if (rolePrefix === 'bracket') return `[${r.toUpperCase()}]`;
      if (rolePrefix === 'colon') return `${r.charAt(0).toUpperCase() + r.slice(1)}:`;
      return `${r.toUpperCase()}:`;
    };
    return lines.map((line, i) => {
      try {
        const obj = JSON.parse(line);
        const msgs = extractMessages(obj);
        if (msgs.length === 0) return `=== Example ${i + 1} ===\n${line}`;
        const body = msgs.map(m => `${makePrefix(m.role)} ${m.content}`).join('\n');
        return `=== Example ${i + 1} ===\n${body}`;
      } catch {
        return `=== Example ${i + 1} ===\n${line}`;
      }
    }).join('\n\n');
  }

  if (format === 'alpaca') {
    const { systemAs, splitMultiTurn } = settings.alpaca;
    const records: string[] = [];
    lines.forEach(line => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const msgs = extractMessages(obj);
        if (msgs.length === 0) return;

        const systemMsg = msgs.find(m => m.role === 'system');
        const systemContent = systemAs === 'input' ? (systemMsg?.content ?? '') : '';

        const turns: { user: string; assistant: string }[] = [];
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].role === 'user') {
            const next = msgs[i + 1];
            if (next && next.role === 'assistant') {
              turns.push({ user: msgs[i].content, assistant: next.content });
              i++;
            }
          }
        }
        if (turns.length === 0) return;

        if (splitMultiTurn) {
          turns.forEach(turn => {
            records.push(JSON.stringify({ instruction: turn.user, input: systemContent, output: turn.assistant }));
          });
        } else {
          const instruction = turns.map(t => t.user).join('\n');
          const output = turns.map(t => t.assistant).join('\n');
          records.push(JSON.stringify({ instruction, input: systemContent, output }));
        }
      } catch {
        // skip
      }
    });
    return records.join('\n');
  }

  if (format === 'sharegpt') {
    const { roleHuman, roleAssistant, includeSystem } = settings.sharegpt;
    const roleMap: Record<string, string> = {
      system: 'system',
      user: roleHuman,
      assistant: roleAssistant,
    };
    const records: string[] = [];
    lines.forEach(line => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const msgs = extractMessages(obj);
        if (msgs.length === 0) return;
        const conversations = msgs
          .filter(m => includeSystem || m.role !== 'system')
          .map(m => ({ from: roleMap[m.role] ?? m.role, value: m.content }));
        if (conversations.length > 0) {
          records.push(JSON.stringify({ conversations }));
        }
      } catch {
        // skip
      }
    });
    return records.join('\n');
  }

  return content;
}
