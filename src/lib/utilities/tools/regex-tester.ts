import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';

const MAX_MATCHES = 1000;
const TIMEOUT_MS = 1000;

export interface RegexMatch {
  index: number;
  value: string;
  line: number;
  groups: Record<string, string>;
}

export interface RegexTesterResult {
  matches: RegexMatch[];
  count: number;
  replaced?: string;
  timedOut: boolean;
  patternError?: string;
}

function getLineNumber(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

const regexTester: UtilityToolModule = {
  id: 'regex-tester',
  name: 'Regex Tester',
  category: 'validation',
  async run(payload: UtilityPayload): Promise<UtilityResult> {
    const testString = payload.input;
    const pattern = (payload.options?.pattern as string) ?? '';
    const flags = (payload.options?.flags as string) ?? '';
    const replacement = (payload.options?.replacement as string | undefined);

    if (!pattern) {
      return { ok: true, data: { matches: [], count: 0, timedOut: false } as RegexTesterResult };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      const data: RegexTesterResult = {
        matches: [],
        count: 0,
        timedOut: false,
        patternError: e instanceof Error ? e.message : String(e),
      };
      return { ok: true, data };
    }

    const runMatch = (): RegexTesterResult => {
      const matches: RegexMatch[] = [];
      let timedOut = false;
      const start = Date.now();

      try {
        if (flags.includes('g') || flags.includes('y')) {
          const iter = testString.matchAll(regex);
          for (const m of iter) {
            if (Date.now() - start > TIMEOUT_MS) { timedOut = true; break; }
            if (matches.length >= MAX_MATCHES) break;
            matches.push({
              index: m.index ?? 0,
              value: m[0],
              line: getLineNumber(testString, m.index ?? 0),
              groups: (m.groups as Record<string, string>) ?? {},
            });
          }
        } else {
          const m = testString.match(regex);
          if (m) {
            matches.push({
              index: m.index ?? 0,
              value: m[0],
              line: getLineNumber(testString, m.index ?? 0),
              groups: (m.groups as Record<string, string>) ?? {},
            });
          }
        }
      } catch {
        timedOut = true;
      }

      let replaced: string | undefined;
      if (replacement !== undefined && replacement !== '' && !timedOut) {
        try {
          replaced = testString.replace(regex, replacement);
        } catch {
          replaced = undefined;
        }
      }

      return { matches, count: matches.length, replaced, timedOut };
    };

    const result = await Promise.race([
      Promise.resolve(runMatch()),
      new Promise<RegexTesterResult>(resolve =>
        setTimeout(() => resolve({ matches: [], count: 0, timedOut: true }), TIMEOUT_MS + 50)
      ),
    ]);

    return { ok: true, data: result };
  },
};

export default regexTester;
