/// <reference types="@cloudflare/workers-types" />
// Phase 1A skeleton — returns 501 Not Implemented.
// Phase 1C will implement: pdf-parse / mammoth / exceljs + Hono rate limiting via KV.

export async function onRequestPost(_context: {
  request: Request;
  env: { RATE_LIMIT?: KVNamespace };
}): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: {
        code: 'not_implemented',
        message: 'Document parsing is coming in Phase 1C. Use the Convert tab for JSONL datasets.',
      },
    }),
    {
      status: 501,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
