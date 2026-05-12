import type presetsJson from '../data/presets.json';

export type Preset = typeof presetsJson[number];

export interface ValidationError {
  line: number;
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

const MAX_ERRORS = 200;

export function validateJsonl(content: string, preset: Preset): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');
  let exampleCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    exampleCount++;
    if (errors.length >= MAX_ERRORS) break;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw);
    } catch {
      errors.push({
        line: i + 1,
        field: '',
        code: 'invalid_json',
        message: 'Invalid JSON',
        suggestion: 'Each line must be a single valid JSON object',
      });
      continue;
    }

    if (Array.isArray(obj) || typeof obj !== 'object' || obj === null) {
      errors.push({
        line: i + 1,
        field: '',
        code: 'not_an_object',
        message: 'Line must be a JSON object, not an array or primitive',
      });
      continue;
    }

    const lineErrors = validateLine(obj, i + 1, preset);
    errors.push(...lineErrors.slice(0, MAX_ERRORS - errors.length));
  }

  // Dataset-level checks (prepend so they appear at top of problems panel)
  const { rules } = preset;
  if (exampleCount > 0) {
    if (rules.minExamples && exampleCount < rules.minExamples) {
      errors.unshift({
        line: 0,
        field: 'dataset',
        code: 'too_few_examples',
        message: `${exampleCount} example${exampleCount === 1 ? '' : 's'} — ${preset.name} requires at least ${rules.minExamples}`,
        suggestion: `Add ${rules.minExamples - exampleCount} more example${rules.minExamples - exampleCount === 1 ? '' : 's'}`,
      });
    }
    if (rules.maxExamples && exampleCount > rules.maxExamples) {
      errors.unshift({
        line: 0,
        field: 'dataset',
        code: 'too_many_examples',
        message: `${exampleCount.toLocaleString()} examples — ${preset.name} accepts at most ${rules.maxExamples.toLocaleString()}`,
      });
    }
  }

  return errors;
}

function validateLine(
  obj: Record<string, unknown>,
  lineNum: number,
  preset: Preset
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { rules, format } = preset;

  for (const field of rules.requiredFields) {
    if (!(field in obj)) {
      errors.push({
        line: lineNum,
        field,
        code: 'missing_required_field',
        message: `Missing required field "${field}"`,
        suggestion: `${preset.name} requires "${field}" in every example`,
      });
    }
  }

  for (const field of rules.forbiddenFields) {
    if (field in obj) {
      errors.push({
        line: lineNum,
        field,
        code: 'forbidden_field',
        message: `Field "${field}" is not allowed by ${preset.name}`,
        suggestion: `Remove the "${field}" field`,
      });
    }
  }

  if (format === 'chatml' || format === 'harmony') {
    errors.push(...validateChatFormat(obj, lineNum, preset));
  } else if (format === 'alpaca') {
    errors.push(...validateAlpacaFormat(obj, lineNum));
  }

  return errors;
}

function validateChatFormat(
  obj: Record<string, unknown>,
  lineNum: number,
  preset: Preset
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { rules } = preset;
  const messages = obj['messages'];

  if (!messages) return errors; // caught by requiredFields check

  if (!Array.isArray(messages)) {
    errors.push({
      line: lineNum,
      field: 'messages',
      code: 'messages_not_array',
      message: '"messages" must be an array',
      suggestion: 'Format: "messages": [{"role": "user", "content": "..."}]',
    });
    return errors;
  }

  if (messages.length < rules.minMessagesPerExample) {
    errors.push({
      line: lineNum,
      field: 'messages',
      code: 'too_few_messages',
      message: `${messages.length} message${messages.length === 1 ? '' : 's'} — ${preset.name} requires at least ${rules.minMessagesPerExample}`,
    });
  }

  if (rules.maxMessagesPerExample !== null && messages.length > rules.maxMessagesPerExample) {
    errors.push({
      line: lineNum,
      field: 'messages',
      code: 'too_many_messages',
      message: `${messages.length} messages — ${preset.name} allows at most ${rules.maxMessagesPerExample}`,
    });
  }

  if (rules.firstMessageRole && messages.length > 0) {
    const first = messages[0] as Record<string, unknown> | undefined;
    if (first?.role !== rules.firstMessageRole) {
      errors.push({
        line: lineNum,
        field: 'messages[0].role',
        code: 'wrong_first_role',
        message: `First message role "${first?.role}" — ${preset.name} expects "${rules.firstMessageRole}"`,
        suggestion: `Change the first message role to "${rules.firstMessageRole}"`,
      });
    }
  }

  if (rules.systemMessageRequired) {
    const hasSystem = messages.some(
      (m: unknown) => (m as Record<string, unknown>)?.role === 'system'
    );
    if (!hasSystem) {
      errors.push({
        line: lineNum,
        field: 'messages',
        code: 'missing_system_message',
        message: `${preset.name} requires a system message`,
        suggestion: 'Add {"role": "system", "content": "..."} as the first message',
      });
    }
  }

  messages.forEach((msg: unknown, idx: number) => {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      errors.push({
        line: lineNum,
        field: `messages[${idx}]`,
        code: 'invalid_message',
        message: `messages[${idx}] must be an object`,
      });
      return;
    }

    const m = msg as Record<string, unknown>;

    if (!('role' in m)) {
      errors.push({
        line: lineNum,
        field: `messages[${idx}].role`,
        code: 'missing_role',
        message: `messages[${idx}] missing "role"`,
        suggestion: `Add "role": one of ${rules.messageRoles.map((r) => `"${r}"`).join(' | ')}`,
      });
    } else if (rules.messageRoles.length > 0 && !(rules.messageRoles as string[]).includes(m.role as string)) {
      errors.push({
        line: lineNum,
        field: `messages[${idx}].role`,
        code: 'invalid_role',
        message: `messages[${idx}].role "${m.role}" — expected ${rules.messageRoles.map((r) => `"${r}"`).join(' | ')}`,
        suggestion: `Valid roles for ${preset.name}: ${rules.messageRoles.join(', ')}`,
      });
    }

    if (!('content' in m)) {
      errors.push({
        line: lineNum,
        field: `messages[${idx}].content`,
        code: 'missing_content',
        message: `messages[${idx}] missing "content"`,
      });
    } else if (typeof m.content !== 'string' && m.content !== null) {
      errors.push({
        line: lineNum,
        field: `messages[${idx}].content`,
        code: 'invalid_content_type',
        message: `messages[${idx}].content must be a string`,
      });
    }
  });

  return errors;
}

function validateAlpacaFormat(obj: Record<string, unknown>, lineNum: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!('instruction' in obj) || typeof obj.instruction !== 'string') {
    errors.push({
      line: lineNum,
      field: 'instruction',
      code: 'missing_instruction',
      message: 'Missing "instruction" field',
      suggestion: 'Alpaca format: {"instruction": "...", "input": "...", "output": "..."}',
    });
  }

  if (!('output' in obj) || typeof obj.output !== 'string') {
    errors.push({
      line: lineNum,
      field: 'output',
      code: 'missing_output',
      message: 'Missing "output" field',
    });
  }

  return errors;
}
