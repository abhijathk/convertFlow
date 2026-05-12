interface Env {
  CONVERTKIT_API_KEY?: string;
  CONVERTKIT_FORM_ID?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });

  let body: { email?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: { code: 'bad_request', message: 'invalid JSON' } }, 400);
  }

  const email = body.email?.trim() ?? '';
  if (!EMAIL_RE.test(email)) {
    return json({ error: { code: 'invalid_email', message: 'invalid email' } }, 422);
  }

  const apiKey = context.env.CONVERTKIT_API_KEY;
  const formId = context.env.CONVERTKIT_FORM_ID;

  if (!apiKey || !formId) {
    // Dev mode: log and return success so the form works locally
    console.log('[subscribe] email:', email, '(ConvertKit not configured)');
    return json({ ok: true });
  }

  const ckRes = await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, email }),
  });

  if (!ckRes.ok) {
    const detail = await ckRes.text().catch(() => '');
    console.error('[subscribe] ConvertKit error:', ckRes.status, detail);
    return json({ error: { code: 'upstream_error', message: 'subscription service error' } }, 502);
  }

  return json({ ok: true });
}
