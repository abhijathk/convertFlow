import { chunkText } from './chunk';

export type ImportTemplate = 'qa' | 'context-answer' | 'instruct';

export function fileToConversationalJsonl(
  text: string,
  template: ImportTemplate,
  systemPrompt: string,
  chunkSize: number
): string {
  const chunks = chunkText(text, 'fixed', { maxTokens: chunkSize, overlap: 0 });

  return chunks
    .filter(c => c.text.trim().length > 0)
    .map(({ text: chunk }) => {
      if (template === 'qa') {
        return JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: chunk },
            { role: 'assistant', content: '' },
          ],
        });
      }
      if (template === 'context-answer') {
        return JSON.stringify({
          messages: [
            { role: 'system', content: `Answer using the following context.\n\nContext:\n${chunk}` },
            { role: 'user', content: '' },
            { role: 'assistant', content: '' },
          ],
        });
      }
      // instruct (alpaca-style)
      return JSON.stringify({
        instruction: systemPrompt || 'Summarize the following passage.',
        input: chunk,
        output: '',
      });
    })
    .join('\n');
}
