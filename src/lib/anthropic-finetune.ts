export interface AnthropicFinetuneResult {
  jobId: string;
}

export interface AnthropicFinetuneOptions {
  jsonl: string;
  baseModel: string;
  apiKey: string;
  onProgress?: (msg: string) => void;
}

// TODO: Anthropic fine-tuning is in private beta. The public endpoint and
// request schema are not yet stable. Update this implementation when the API
// is generally available. Track: https://docs.anthropic.com/en/docs/fine-tuning
//
// The expected endpoint will likely be POST https://api.anthropic.com/v1/fine-tuning/jobs
// with a multipart or JSON body containing the training file and model name.

export async function pushToAnthropic(_opts: AnthropicFinetuneOptions): Promise<AnthropicFinetuneResult> {
  throw new Error(
    'Anthropic fine-tune API is in private beta and not yet publicly available. ' +
    'Check https://docs.anthropic.com for updates on the fine-tuning API.'
  );
}
