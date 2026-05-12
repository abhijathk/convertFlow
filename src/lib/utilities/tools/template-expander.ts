import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

export interface TemplateExpanderResult {
  rendered: string;
  bound: string[];
  unbound: string[];
}

const templateExpander: UtilityToolModule = {
  id: 'template-expander',
  name: 'Prompt Template Expander',
  category: 'text',
  run(payload: UtilityPayload): UtilityResult {
    const template = payload.input;
    const varsRaw = ((payload.options ?? {})['variables'] as string) ?? '';

    if (!template) return { ok: false, error: 'Template is empty.' };

    const vars: Record<string, string> = {};
    for (const line of varsRaw.split('\n')) {
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key) vars[key] = val;
    }

    const placeholderRe = /\{\{(\w+)\}\}/g;
    const allPlaceholders = [...new Set([...template.matchAll(placeholderRe)].map(m => m[1]))];

    const bound: string[] = [];
    const unbound: string[] = [];

    for (const p of allPlaceholders) {
      if (p in vars) bound.push(p);
      else unbound.push(p);
    }

    const rendered = template.replace(placeholderRe, (_, name: string) => {
      return name in vars ? vars[name] : `{{${name}}}`;
    });

    const data: TemplateExpanderResult = { rendered, bound, unbound };
    return { ok: true, data };
  },
};

export default templateExpander;
