<script lang="ts">
  import { analytics } from '../lib/analytics';

  let email = $state('');
  let status: 'idle' | 'loading' | 'ok' | 'error' = $state('idle');
  let errorMsg = $state('');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function submit(e: Event) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      status = 'error';
      errorMsg = 'invalid email';
      return;
    }
    status = 'loading';
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        status = 'ok';
        analytics.emailSubmitted();
      } else {
        const data = await res.json().catch(() => ({}));
        status = 'error';
        errorMsg = data?.error?.message ?? 'something went wrong';
      }
    } catch {
      status = 'error';
      errorMsg = 'could not reach server';
    }
  }
</script>

<div class="email-capture" role="region" aria-label="Subscribe for updates">
  {#if status === 'ok'}
    <p class="ok" aria-live="polite">✓ check your inbox</p>
  {:else}
    <form onsubmit={submit} class="form">
      <label for="email-input" class="prompt" aria-label="Enter your email">›</label>
      <input
        id="email-input"
        type="email"
        bind:value={email}
        placeholder="you@domain.com"
        autocomplete="email"
        disabled={status === 'loading'}
        aria-invalid={status === 'error'}
        aria-describedby={status === 'error' ? 'email-error' : undefined}
      />
      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? '[···]' : '[subscribe →]'}
      </button>
    </form>
    {#if status === 'error'}
      <p class="err" id="email-error" role="alert" aria-live="assertive">× {errorMsg}</p>
    {/if}
  {/if}
</div>

<style>
  .email-capture { font-size: 13px; }

  .form {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--surface);
    max-width: 420px;
  }

  .prompt {
    color: var(--accent);
    padding: 0 8px;
    user-select: none;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    background: none;
    border: none;
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;
    padding: 8px 4px;
    outline: none;
    min-width: 0;
  }

  input::placeholder { color: var(--muted); }
  input:focus { outline: none; }

  .form:focus-within {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  button {
    background: none;
    border: none;
    border-left: 1px solid var(--border);
    padding: 8px 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--accent);
    flex-shrink: 0;
    white-space: nowrap;
  }

  button:hover:not(:disabled) { background: var(--border); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .ok { color: var(--ok); margin: 0; }
  .err { color: var(--err); margin: 4px 0 0; font-size: 12px; }
</style>
