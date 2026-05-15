import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import type { ProgressCallback } from '@huggingface/transformers';

export interface PiiMatch {
  type: string;
  start: number;
  end: number;
  value: string;
  line: number;
  column: number;
  /** Score in [0,1]; 1 for regex matches, confidence score for NER. */
  score?: number;
  /** True when found by neural NER rather than regex. */
  fromNer?: boolean;
}

export interface PiiResult {
  matches: PiiMatch[];
  byType: Record<string, number>;
  redacted?: string;
  capped: boolean;
  warning?: string;
}

export type RedactMode = 'mask' | 'hash' | 'strip';

export type DetectorGroup = 'identifier' | 'financial' | 'network' | 'secret' | 'health';

const MAX_INPUT = 1_048_576;
const MAX_MATCHES = 100_000;
const MAX_SCAN_MS = 5_000;

function luhn(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  let sum = 0;
  let odd = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (odd) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    odd = !odd;
  }
  return sum % 10 === 0;
}

// ISO 13616 expected IBAN lengths by country code
const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BE: 16, BA: 20, BR: 29, BG: 22,
  CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28, EE: 20, FO: 18, FI: 18,
  FR: 27, GE: 22, DE: 22, GI: 23, GR: 27, GL: 18, GT: 28, HU: 28, IS: 26,
  IE: 22, IL: 23, IT: 27, JO: 30, KZ: 20, KW: 30, LV: 21, LB: 28, LI: 21,
  LT: 20, LU: 20, MK: 19, MT: 31, MR: 27, MU: 30, MC: 27, MD: 24, ME: 22,
  NL: 18, NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29, RO: 24, SM: 27,
  SA: 24, RS: 22, SK: 24, SI: 19, ES: 24, SE: 24, CH: 21, TN: 24, TR: 26,
  AE: 23, GB: 22, VG: 24,
};

function validateIban(m: string): boolean {
  const normalized = m.replace(/\s/g, '').toUpperCase();
  const country = normalized.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  if (expected !== undefined && normalized.length !== expected) return false;
  // Basic mod-97 check
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}

interface Detector {
  type: string;
  regex: RegExp;
  group: DetectorGroup;
  postFilter?: (m: string) => boolean;
  approximate?: boolean;
}

// Ordered specificity-first: longer/more-anchored patterns before generic ones.
// This matters for overlap dedup — more specific wins.
const DETECTORS: Detector[] = [
  // ── Secrets / API keys (most specific prefixes first) ─────────────────────
  {
    type: 'pem-private-key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/gs,
    group: 'secret',
  },
  {
    type: 'aws-secret-key',
    regex: /aws_secret(?:_access_key)?\s*=\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi,
    group: 'secret',
  },
  {
    type: 'github-pat',
    // GitHub fine-grained PATs: github_pat_ + 82-char payload (classic) or 93-char (newer)
    regex: /\bgithub_pat_[A-Za-z0-9_]{76,}\b/g,
    group: 'secret',
  },
  {
    type: 'slack-token',
    regex: /\bxox[abp]-[A-Za-z0-9-]{10,}\b/g,
    group: 'secret',
  },
  {
    type: 'google-api-key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    group: 'secret',
  },
  {
    type: 'stripe-key',
    regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g,
    group: 'secret',
  },
  {
    type: 'twilio-sid',
    // Twilio SIDs: 2-char prefix + 32 hex chars = 34 total
    regex: /\b(?:AC|SK|SM)[a-f0-9]{32,}\b/g,
    group: 'secret',
  },
  {
    type: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    group: 'secret',
  },
  {
    type: 'aws-key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    group: 'secret',
  },
  {
    type: 'api-key',
    regex: /\b(?:sk-|hf_|pk_|ghp_|gho_)[A-Za-z0-9_-]{20,}\b/g,
    group: 'secret',
  },

  // ── Crypto addresses ──────────────────────────────────────────────────────
  {
    type: 'ethereum-address',
    regex: /\b0x[a-fA-F0-9]{40}\b/g,
    group: 'financial',
  },
  {
    type: 'bitcoin-address',
    regex: /\b(?:bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g,
    group: 'financial',
  },

  // ── Network / hardware ───────────────────────────────────────────────────
  {
    type: 'mac-address',
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    group: 'network',
  },
  {
    type: 'ipv6',
    regex: /\b(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{0,4}\b/g,
    group: 'network',
  },
  {
    type: 'ipv4',
    regex: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
    group: 'network',
    postFilter: (m) => m !== '0.0.0.0' && m !== '255.255.255.255',
  },

  // ── Financial identifiers ────────────────────────────────────────────────
  {
    type: 'iban',
    // Allow 1–4 chars in trailing group to handle print formats like "0130 00"
    regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{1,4}){4,8}\b/g,
    group: 'financial',
    postFilter: validateIban,
  },
  {
    type: 'credit-card',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    group: 'financial',
    postFilter: luhn,
  },
  {
    type: 'ein',
    regex: /\b\d{2}-\d{7}\b/g,
    group: 'financial',
  },

  // ── Personal / national IDs ──────────────────────────────────────────────
  {
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    group: 'identifier',
  },
  {
    type: 'uk-nino',
    regex: /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/g,
    group: 'identifier',
  },
  {
    type: 'pan',
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    group: 'identifier',
  },
  {
    type: 'aadhaar',
    // 12 digits with optional space/dash separators, groups of 4
    regex: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
    group: 'identifier',
    // Reject anything that also passes Luhn (CC overlap) — Aadhaar is always 12 digits
    postFilter: (m) => m.replace(/\D/g, '').length === 12,
  },
  {
    type: 'passport',
    regex: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
    group: 'identifier',
    approximate: true,
  },
  {
    type: 'driver-license-us',
    regex: /\b[A-Z]{1,2}\d{5,8}\b/g,
    group: 'identifier',
    approximate: true,
  },

  // ── Health ───────────────────────────────────────────────────────────────
  {
    type: 'medicare-id',
    regex: /\b[1-9][A-Z][A-Z0-9]\d[A-Z][A-Z0-9]\d[A-Z]{2}\d{2}\b/g,
    group: 'health',
    approximate: true,
  },

  // ── Structured contact / network ─────────────────────────────────────────
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    group: 'identifier',
  },
  {
    type: 'uuid',
    regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    group: 'identifier',
  },
  {
    type: 'url',
    regex: /\bhttps?:\/\/[^\s<>"']+/g,
    group: 'network',
  },
  {
    type: 'us-phone',
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    group: 'identifier',
  },
  {
    type: 'intl-phone',
    regex: /\+\d{1,3}[\s-]?\d{4,14}/g,
    group: 'identifier',
  },
  {
    type: 'dob',
    regex: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g,
    group: 'identifier',
  },
];

function buildLineIndex(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function getLineCol(starts: number[], offset: number): { line: number; column: number } {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
}

async function sha256First8(value: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

const TAG_FOR_TYPE: Record<string, string> = {
  email: 'EMAIL',
  'us-phone': 'PHONE',
  'intl-phone': 'PHONE',
  ssn: 'SSN',
  'credit-card': 'CREDIT_CARD',
  ipv4: 'IP',
  ipv6: 'IP',
  url: 'URL',
  uuid: 'UUID',
  'api-key': 'API_KEY',
  'aws-key': 'AWS_KEY',
  'aws-secret-key': 'AWS_SECRET',
  dob: 'DOB',
  passport: 'PASSPORT',
  'driver-license-us': 'DL',
  iban: 'IBAN',
  'uk-nino': 'NINO',
  aadhaar: 'AADHAAR',
  pan: 'PAN',
  ein: 'EIN',
  'mac-address': 'MAC',
  'bitcoin-address': 'BTC_ADDR',
  'ethereum-address': 'ETH_ADDR',
  'github-pat': 'GITHUB_PAT',
  'slack-token': 'SLACK_TOKEN',
  'google-api-key': 'GOOGLE_KEY',
  'stripe-key': 'STRIPE_KEY',
  'twilio-sid': 'TWILIO_SID',
  jwt: 'JWT',
  'pem-private-key': 'PEM_KEY',
  'medicare-id': 'MEDICARE_ID',
};

const SECRET_TYPES = new Set([
  'github-pat', 'jwt', 'stripe-key', 'slack-token', 'pem-private-key',
  'aws-secret-key', 'aws-key', 'api-key', 'google-api-key', 'twilio-sid',
]);

const NER_TYPE_MAP: Record<string, string> = {
  PER: 'ner-person',
  ORG: 'ner-organization',
  LOC: 'ner-location',
  MISC: 'ner-misc',
};

const TAG_FOR_NER_TYPE: Record<string, string> = {
  'ner-person': 'PERSON',
  'ner-organization': 'ORG',
  'ner-location': 'LOCATION',
  'ner-misc': 'MISC',
};

const piiRedactor: UtilityToolModule = {
  id: 'pii-redactor',
  name: 'PII Detector',
  category: 'validation',
  async run(payload: UtilityPayload): Promise<UtilityResult> {
    const raw = payload.input.slice(0, MAX_INPUT);
    const lineStarts = buildLineIndex(raw);
    const enabledTypes = (payload.options?.enabledTypes as string[] | undefined) ?? DETECTORS.map(d => d.type);
    const modes = (payload.options?.modes as Record<string, RedactMode> | undefined) ?? {};
    const doRedact = (payload.options?.redact as boolean | undefined) ?? false;
    const useNeural = (payload.options?.useNeural as boolean | undefined) ?? false;
    const nerThreshold = (payload.options?.nerThreshold as number | undefined) ?? 0.85;
    const onProgress = payload.options?.onProgress as ((loaded: number, total: number) => void) | undefined;

    const rawMatches: PiiMatch[] = [];
    let capped = false;
    let timedOut = false;
    const deadline = Date.now() + MAX_SCAN_MS;

    for (const det of DETECTORS) {
      if (!enabledTypes.includes(det.type)) continue;
      if (Date.now() >= deadline) { timedOut = true; break; }
      det.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = det.regex.exec(raw)) !== null) {
        if (Date.now() >= deadline) { timedOut = true; break; }
        if (det.postFilter && !det.postFilter(m[0])) continue;
        if (rawMatches.length >= MAX_MATCHES) { capped = true; break; }
        const { line, column } = getLineCol(lineStarts, m.index);
        rawMatches.push({ type: det.type, start: m.index, end: m.index + m[0].length, value: m[0], line, column, score: 1 });
      }
      if (capped || timedOut) break;
    }

    // Neural NER pass — runs after regex so regex positions act as high-water marks for dedup
    if (useNeural && !capped && !timedOut) {
      try {
        const { detectNamedEntities } = await import('../../ner-pii');
        const entities = await detectNamedEntities(raw, onProgress);
        for (const ent of entities) {
          if (ent.score < nerThreshold) continue;
          if (rawMatches.length >= MAX_MATCHES) { capped = true; break; }
          const nerType = NER_TYPE_MAP[ent.type] ?? 'ner-misc';
          const { line, column } = getLineCol(lineStarts, ent.start);
          rawMatches.push({
            type: nerType,
            start: ent.start,
            end: ent.end,
            value: ent.entity,
            line,
            column,
            score: ent.score,
            fromNer: true,
          });
        }
      } catch {
        // Neural NER failed — continue with regex results only
      }
    }

    // Sort by start offset, then by length descending (longer/more-specific wins overlap)
    // Regex matches (score=1, fromNer=undefined) sort before NER matches at same position
    rawMatches.sort((a, b) =>
      a.start - b.start ||
      (b.end - b.start) - (a.end - a.start) ||
      (a.fromNer ? 1 : 0) - (b.fromNer ? 1 : 0)
    );

    // Deduplicate overlapping spans: keep the first (longest) match at each span
    const allMatches: PiiMatch[] = [];
    let highWaterEnd = -1;
    for (const m of rawMatches) {
      if (m.start < highWaterEnd) continue; // overlaps a previous match
      allMatches.push(m);
      highWaterEnd = m.end;
    }

    const byType: Record<string, number> = {};
    for (const match of allMatches) {
      byType[match.type] = (byType[match.type] ?? 0) + 1;
    }

    let redacted: string | undefined;
    if (doRedact) {
      const hashCache = new Map<string, string>();
      const parts: string[] = [];
      let cursor = 0;

      for (const match of allMatches) {
        if (match.start < cursor) continue;
        parts.push(raw.slice(cursor, match.start));
        const mode: RedactMode = modes[match.type] ?? 'mask';
        const tag =
          TAG_FOR_TYPE[match.type] ??
          TAG_FOR_NER_TYPE[match.type] ??
          match.type.toUpperCase();
        if (mode === 'strip') {
          // nothing
        } else if (mode === 'hash') {
          let h = hashCache.get(match.value);
          if (!h) {
            h = await sha256First8(match.value);
            hashCache.set(match.value, h);
          }
          parts.push(`[${tag}_${h}]`);
        } else {
          parts.push(`[${tag}]`);
        }
        cursor = match.end;
      }
      parts.push(raw.slice(cursor));
      redacted = parts.join('');
    }

    const warning = timedOut
      ? 'Scan timed out (5 s limit). Results may be incomplete.'
      : undefined;

    const data: PiiResult = { matches: allMatches, byType, redacted, capped, warning };
    return { ok: true, data };
  },
};

export { SECRET_TYPES };
export default piiRedactor;
