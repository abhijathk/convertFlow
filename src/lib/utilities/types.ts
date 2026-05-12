export interface UtilityPayload {
  input: string;
  options?: Record<string, unknown>;
}

export interface UtilityResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface UtilityToolModule {
  id: string;
  name: string;
  category: 'llm' | 'data' | 'text' | 'validation' | 'encoding' | 'utility';
  run: (payload: UtilityPayload) => Promise<UtilityResult> | UtilityResult;
}
