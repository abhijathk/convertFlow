import type { UtilityToolModule, UtilityPayload, UtilityResult } from '../types';
import { approximateTokens } from '../../tokenize';

const tokenEstimator: UtilityToolModule = {
  id: 'token-estimator',
  name: 'Token Estimator',
  category: 'llm',
  run(payload: UtilityPayload): UtilityResult {
    const text = payload.input;
    const approximate = approximateTokens(text);
    const chars = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const lines = text === '' ? 0 : text.split('\n').length;
    return {
      ok: true,
      data: { approximate, chars, words, lines },
      metadata: { input_length: text.length },
    };
  },
};

export default tokenEstimator;
