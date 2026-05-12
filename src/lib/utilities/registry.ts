import type { UtilityPayload, UtilityResult, UtilityToolModule } from './types';

export type { UtilityPayload, UtilityResult, UtilityToolModule };

export interface UtilityMeta {
  id: string;
  name: string;
  category: 'llm' | 'data' | 'text' | 'validation' | 'encoding' | 'utility';
  autoPrefillEligible: boolean;
  description: string;
}

export const TOOLS: UtilityMeta[] = [
  { id: 'token-estimator', name: 'Token Estimator', category: 'llm', autoPrefillEligible: true, description: 'Approximate + exact token counts for any text.' },
  { id: 'cost-calculator', name: 'Cost Calculator', category: 'llm', autoPrefillEligible: true, description: 'Estimate input, cached, and output cost by model.' },
  { id: 'json-validator', name: 'JSON / JSONL Validator', category: 'data', autoPrefillEligible: true, description: 'Validate, pretty-print, and minify JSON or JSONL.' },
  { id: 'text-transformer', name: 'Text Transformer', category: 'text', autoPrefillEligible: true, description: 'Trim, dedupe, normalize quotes, case conversion.' },
  { id: 'regex-tester', name: 'Regex Tester', category: 'validation', autoPrefillEligible: true, description: 'Test patterns, see matches, preview replacements.' },
  { id: 'encoding-tools', name: 'Base64 / URL Encode-Decode', category: 'encoding', autoPrefillEligible: true, description: 'Encode and decode Base64 and URL strings.' },
  { id: 'hash-tools', name: 'Hash Generator', category: 'utility', autoPrefillEligible: true, description: 'Generate SHA-256, SHA-1, or SHA-512 hashes.' },
  { id: 'timestamp-tools', name: 'Timestamp Converter', category: 'utility', autoPrefillEligible: false, description: 'Convert Unix, ISO 8601, and local timestamps.' },
  { id: 'dataset-splitter', name: 'Dataset Splitter', category: 'data', autoPrefillEligible: true, description: 'Split JSONL into train/val/test with seeded shuffle.' },
  { id: 'template-expander', name: 'Prompt Template Expander', category: 'text', autoPrefillEligible: true, description: 'Render {{placeholder}} templates with key=value variables.' },
  { id: 'duplicate-detector', name: 'Duplicate Detector', category: 'validation', autoPrefillEligible: true, description: 'Find exact, normalized, or semantic duplicate rows in JSONL.' },
  { id: 'token-analyzer', name: 'Token-per-row Analyzer', category: 'llm', autoPrefillEligible: true, description: 'Per-row token counts with context window limit warnings.' },
  { id: 'embedding-budget', name: 'Embedding Budget Estimator', category: 'llm', autoPrefillEligible: true, description: 'Estimate embedding cost across providers for your text.' },
  { id: 'conversation-formatter', name: 'Conversation Formatter', category: 'text', autoPrefillEligible: true, description: 'Convert transcripts to OpenAI, Anthropic, Alpaca, or ShareGPT JSONL.' },
  { id: 'pii-redactor', name: 'PII Detector', category: 'validation', autoPrefillEligible: true, description: 'Detect and redact emails, phones, SSNs, credit cards, API keys, and more.' },
  { id: 'schema-migrator', name: 'Schema Migrator', category: 'data', autoPrefillEligible: true, description: 'Convert JSONL between OpenAI, Anthropic, Alpaca, and ShareGPT schemas.' },
];

const toolLoaders = import.meta.glob('./tools/*.ts') as Record<
  string,
  () => Promise<{ default: UtilityToolModule }>
>;

const toolModuleCache = new Map<string, UtilityToolModule>();

async function loadTool(id: string): Promise<UtilityToolModule> {
  if (!toolModuleCache.has(id)) {
    const loader = toolLoaders[`./tools/${id}.ts`];
    if (!loader) throw new Error(`Unknown utility tool: ${id}`);
    const mod = await loader();
    toolModuleCache.set(id, mod.default);
  }
  return toolModuleCache.get(id)!;
}

export async function runUtility(id: string, payload: UtilityPayload): Promise<UtilityResult> {
  try {
    const tool = await loadTool(id);
    return await tool.run(payload);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
