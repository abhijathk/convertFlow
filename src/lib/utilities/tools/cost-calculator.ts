import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import { approximateTokens } from '../../tokenize';

export interface ModelPricing {
  id: string;
  name: string;
  provider: string;
  inputPerM: number;
  outputPerM: number;
  cachedPerM: number;
}

export const MODEL_PRICING: ModelPricing[] = [
  { id: 'gpt-5',                provider: 'OpenAI',    name: 'GPT-5',                  inputPerM: 1.25,  outputPerM: 10.00, cachedPerM: 0.125 },
  { id: 'gpt-5-mini',           provider: 'OpenAI',    name: 'GPT-5 mini',             inputPerM: 0.25,  outputPerM: 2.00,  cachedPerM: 0.025 },
  { id: 'gpt-5-nano',           provider: 'OpenAI',    name: 'GPT-5 nano',             inputPerM: 0.05,  outputPerM: 0.40,  cachedPerM: 0.005 },
  { id: 'gpt-4o',               provider: 'OpenAI',    name: 'GPT-4o',                 inputPerM: 2.50,  outputPerM: 10.00, cachedPerM: 1.25 },
  { id: 'gpt-4o-mini',          provider: 'OpenAI',    name: 'GPT-4o mini',            inputPerM: 0.15,  outputPerM: 0.60,  cachedPerM: 0.075 },
  { id: 'gpt-4.1',              provider: 'OpenAI',    name: 'GPT-4.1',                inputPerM: 2.00,  outputPerM: 8.00,  cachedPerM: 0.50 },
  { id: 'gpt-4.1-mini',         provider: 'OpenAI',    name: 'GPT-4.1 mini',           inputPerM: 0.40,  outputPerM: 1.60,  cachedPerM: 0.10 },
  { id: 'gpt-4.1-nano',         provider: 'OpenAI',    name: 'GPT-4.1 nano',           inputPerM: 0.10,  outputPerM: 0.40,  cachedPerM: 0.025 },
  { id: 'o1',                   provider: 'OpenAI',    name: 'o1',                     inputPerM: 15.00, outputPerM: 60.00, cachedPerM: 7.50 },
  { id: 'o1-mini',              provider: 'OpenAI',    name: 'o1-mini',                inputPerM: 1.10,  outputPerM: 4.40,  cachedPerM: 0.55 },
  { id: 'o3',                   provider: 'OpenAI',    name: 'o3',                     inputPerM: 2.00,  outputPerM: 8.00,  cachedPerM: 0.50 },
  { id: 'o3-mini',              provider: 'OpenAI',    name: 'o3-mini',                inputPerM: 1.10,  outputPerM: 4.40,  cachedPerM: 0.55 },
  { id: 'gpt-3.5-turbo',        provider: 'OpenAI',    name: 'GPT-3.5 Turbo',          inputPerM: 0.50,  outputPerM: 1.50,  cachedPerM: 0.50 },

  { id: 'claude-opus-4',        provider: 'Anthropic', name: 'Claude Opus 4',          inputPerM: 15.00, outputPerM: 75.00, cachedPerM: 1.50 },
  { id: 'claude-opus-4-7',      provider: 'Anthropic', name: 'Claude Opus 4.7',        inputPerM: 15.00, outputPerM: 75.00, cachedPerM: 1.50 },
  { id: 'claude-sonnet-4-6',    provider: 'Anthropic', name: 'Claude Sonnet 4.6',      inputPerM: 3.00,  outputPerM: 15.00, cachedPerM: 0.30 },
  { id: 'claude-sonnet-4',      provider: 'Anthropic', name: 'Claude Sonnet 4',        inputPerM: 3.00,  outputPerM: 15.00, cachedPerM: 0.30 },
  { id: 'claude-3-7-sonnet',    provider: 'Anthropic', name: 'Claude 3.7 Sonnet',      inputPerM: 3.00,  outputPerM: 15.00, cachedPerM: 0.30 },
  { id: 'claude-3-5-sonnet',    provider: 'Anthropic', name: 'Claude 3.5 Sonnet',      inputPerM: 3.00,  outputPerM: 15.00, cachedPerM: 0.30 },
  { id: 'claude-haiku-4-5',     provider: 'Anthropic', name: 'Claude Haiku 4.5',       inputPerM: 1.00,  outputPerM: 5.00,  cachedPerM: 0.10 },
  { id: 'claude-3-5-haiku',     provider: 'Anthropic', name: 'Claude 3.5 Haiku',       inputPerM: 0.80,  outputPerM: 4.00,  cachedPerM: 0.08 },
  { id: 'claude-3-opus',        provider: 'Anthropic', name: 'Claude 3 Opus',          inputPerM: 15.00, outputPerM: 75.00, cachedPerM: 1.50 },
  { id: 'claude-3-haiku',       provider: 'Anthropic', name: 'Claude 3 Haiku',         inputPerM: 0.25,  outputPerM: 1.25,  cachedPerM: 0.03 },

  { id: 'gemini-2-5-pro',       provider: 'Google',    name: 'Gemini 2.5 Pro',         inputPerM: 1.25,  outputPerM: 10.00, cachedPerM: 0.3125 },
  { id: 'gemini-2-5-flash',     provider: 'Google',    name: 'Gemini 2.5 Flash',       inputPerM: 0.30,  outputPerM: 2.50,  cachedPerM: 0.075 },
  { id: 'gemini-2-0-flash',     provider: 'Google',    name: 'Gemini 2.0 Flash',       inputPerM: 0.10,  outputPerM: 0.40,  cachedPerM: 0.025 },
  { id: 'gemini-2-0-flash-lite',provider: 'Google',    name: 'Gemini 2.0 Flash Lite',  inputPerM: 0.075, outputPerM: 0.30,  cachedPerM: 0.019 },
  { id: 'gemini-1-5-pro',       provider: 'Google',    name: 'Gemini 1.5 Pro',         inputPerM: 1.25,  outputPerM: 5.00,  cachedPerM: 0.3125 },
  { id: 'gemini-1-5-flash',     provider: 'Google',    name: 'Gemini 1.5 Flash',       inputPerM: 0.075, outputPerM: 0.30,  cachedPerM: 0.019 },
  { id: 'gemini-1-5-flash-8b',  provider: 'Google',    name: 'Gemini 1.5 Flash-8B',    inputPerM: 0.0375,outputPerM: 0.15,  cachedPerM: 0.01 },

  { id: 'mistral-large-2',      provider: 'Mistral',   name: 'Mistral Large 2',        inputPerM: 2.00,  outputPerM: 6.00,  cachedPerM: 2.00 },
  { id: 'mistral-medium-3',     provider: 'Mistral',   name: 'Mistral Medium 3',       inputPerM: 0.40,  outputPerM: 2.00,  cachedPerM: 0.40 },
  { id: 'mistral-small',        provider: 'Mistral',   name: 'Mistral Small',          inputPerM: 0.20,  outputPerM: 0.60,  cachedPerM: 0.20 },
  { id: 'mistral-nemo',         provider: 'Mistral',   name: 'Mistral Nemo',           inputPerM: 0.15,  outputPerM: 0.15,  cachedPerM: 0.15 },
  { id: 'codestral',            provider: 'Mistral',   name: 'Codestral',              inputPerM: 0.20,  outputPerM: 0.60,  cachedPerM: 0.20 },

  { id: 'grok-2',               provider: 'xAI',       name: 'Grok 2',                 inputPerM: 2.00,  outputPerM: 10.00, cachedPerM: 2.00 },
  { id: 'grok-2-mini',          provider: 'xAI',       name: 'Grok 2 mini',            inputPerM: 0.20,  outputPerM: 1.00,  cachedPerM: 0.20 },
  { id: 'grok-3',               provider: 'xAI',       name: 'Grok 3',                 inputPerM: 3.00,  outputPerM: 15.00, cachedPerM: 0.75 },
  { id: 'grok-3-mini',          provider: 'xAI',       name: 'Grok 3 mini',            inputPerM: 0.30,  outputPerM: 0.50,  cachedPerM: 0.075 },

  { id: 'deepseek-v3',          provider: 'DeepSeek',  name: 'DeepSeek V3',            inputPerM: 0.27,  outputPerM: 1.10,  cachedPerM: 0.07 },
  { id: 'deepseek-r1',          provider: 'DeepSeek',  name: 'DeepSeek R1',            inputPerM: 0.55,  outputPerM: 2.19,  cachedPerM: 0.14 },

  { id: 'command-r-plus',       provider: 'Cohere',    name: 'Command R+',             inputPerM: 2.50,  outputPerM: 10.00, cachedPerM: 2.50 },
  { id: 'command-r',            provider: 'Cohere',    name: 'Command R',              inputPerM: 0.15,  outputPerM: 0.60,  cachedPerM: 0.15 },

  { id: 'llama-3-3-70b',        provider: 'Meta',      name: 'Llama 3.3 70B',          inputPerM: 0.88,  outputPerM: 0.88,  cachedPerM: 0.88 },
  { id: 'llama-3-1-405b',       provider: 'Meta',      name: 'Llama 3.1 405B',         inputPerM: 3.50,  outputPerM: 3.50,  cachedPerM: 3.50 },
  { id: 'llama-3-1-70b',        provider: 'Meta',      name: 'Llama 3.1 70B',          inputPerM: 0.88,  outputPerM: 0.88,  cachedPerM: 0.88 },
  { id: 'llama-3-1-8b',         provider: 'Meta',      name: 'Llama 3.1 8B',           inputPerM: 0.18,  outputPerM: 0.18,  cachedPerM: 0.18 },
];

export interface CostResult {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputCost: number;
  outputCost: number;
  cachedCost: number;
  totalCost: number;
}

const costCalculator: UtilityToolModule = {
  id: 'cost-calculator',
  name: 'Cost Calculator',
  category: 'llm',
  run(payload: UtilityPayload): UtilityResult {
    const inputText = payload.input;
    const outputText = (payload.options?.outputText as string) ?? '';
    const cachePct = Math.max(0, Math.min(100, Number(payload.options?.cachePct ?? 0)));
    const modelId = (payload.options?.model as string) ?? MODEL_PRICING[0].id;

    const model = MODEL_PRICING.find(m => m.id === modelId) ?? MODEL_PRICING[0];
    const inputTokens = approximateTokens(inputText);
    const outputTokens = approximateTokens(outputText);
    const cachedTokens = Math.round(inputTokens * (cachePct / 100));
    const billableInputTokens = inputTokens - cachedTokens;

    const inputCost = (billableInputTokens / 1_000_000) * model.inputPerM;
    const outputCost = (outputTokens / 1_000_000) * model.outputPerM;
    const cachedCost = (cachedTokens / 1_000_000) * model.cachedPerM;
    const totalCost = inputCost + outputCost + cachedCost;

    const data: CostResult = {
      model: model.name,
      provider: model.provider,
      inputTokens,
      outputTokens,
      cachedTokens,
      inputCost,
      outputCost,
      cachedCost,
      totalCost,
    };

    return { ok: true, data };
  },
};

export default costCalculator;
