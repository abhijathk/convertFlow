export interface OpenAIFinetuneResult {
  fileId: string;
  jobId: string;
}

export interface OpenAIFinetuneOptions {
  jsonl: string;
  baseModel: string;
  apiKey: string;
  onProgress?: (msg: string) => void;
}

export async function pushToOpenAI(opts: OpenAIFinetuneOptions): Promise<OpenAIFinetuneResult> {
  const { jsonl, baseModel, apiKey, onProgress } = opts;

  onProgress?.('Uploading training file…');

  // Step 1: Upload file to OpenAI Files API
  const blob = new Blob([jsonl], { type: 'application/json' });
  const formData = new FormData();
  formData.append('file', blob, 'training.jsonl');
  formData.append('purpose', 'fine-tune');

  const uploadRes = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => String(uploadRes.status));
    throw new Error(`File upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploadData = await uploadRes.json() as { id: string };
  const fileId = uploadData.id;

  onProgress?.(`File uploaded (${fileId}). Starting fine-tune job…`);

  // Step 2: Create fine-tune job
  const jobRes = await fetch('https://api.openai.com/v1/fine_tuning/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      training_file: fileId,
      model: baseModel,
    }),
  });

  if (!jobRes.ok) {
    const errText = await jobRes.text().catch(() => String(jobRes.status));
    throw new Error(`Fine-tune job creation failed (${jobRes.status}): ${errText}`);
  }

  const jobData = await jobRes.json() as { id: string };
  const jobId = jobData.id;

  onProgress?.(`Job started: ${jobId}`);

  return { fileId, jobId };
}
