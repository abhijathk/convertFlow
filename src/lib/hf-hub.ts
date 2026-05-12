export interface HfPushOptions {
  token: string;
  repo: string;
  fileName: string;
  content: string;
  private: boolean;
}

export interface HfPushResult {
  ok: boolean;
  repoUrl: string;
  error?: string;
}

export async function pushToHfHub(opts: HfPushOptions): Promise<HfPushResult> {
  const { token, repo, fileName, content, private: isPrivate } = opts;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Create or ensure repo exists
  const createRes = await fetch('https://huggingface.co/api/repos/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'dataset', name: repo, private: isPrivate }),
  });
  if (!createRes.ok && createRes.status !== 409) {
    const msg = await createRes.text().catch(() => String(createRes.status));
    throw new Error(`Create repo failed (${createRes.status}): ${msg}`);
  }

  // 2. Commit the file via the commit API (base64 payload, works for text files)
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const commitBody = {
    commit_message: `Upload ${fileName} via DataPrep`,
    operations: [
      {
        key: fileName,
        type: 'addOrUpdate',
        encoding: 'base64',
        content: b64,
      },
    ],
  };
  const commitRes = await fetch(
    `https://huggingface.co/api/datasets/${encodeURIComponent(repo)}/commit/main`,
    { method: 'POST', headers, body: JSON.stringify(commitBody) },
  );
  if (!commitRes.ok) {
    const msg = await commitRes.text().catch(() => String(commitRes.status));
    throw new Error(`Commit failed (${commitRes.status}): ${msg}`);
  }

  return { ok: true, repoUrl: `https://huggingface.co/datasets/${repo}` };
}
