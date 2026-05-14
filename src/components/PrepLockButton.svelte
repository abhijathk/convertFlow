<script lang="ts">
  import { convertState } from '../stores/convertState';

  let hasContent = $derived($convertState.lineCount > 0);
  let prepLocked = $derived(hasContent && !$convertState.prepUnlocked);
  let confirmingUnlock = $state(false);
  let autoLockSecondsLeft = $state(0);
  const AUTO_LOCK_SECONDS = 60;
  let autoLockInterval: ReturnType<typeof setInterval> | undefined;

  function clearAutoLockTimer() {
    if (autoLockInterval) { clearInterval(autoLockInterval); autoLockInterval = undefined; }
    autoLockSecondsLeft = 0;
  }

  function startAutoLockTimer() {
    clearAutoLockTimer();
    autoLockSecondsLeft = AUTO_LOCK_SECONDS;
    autoLockInterval = setInterval(() => {
      autoLockSecondsLeft -= 1;
      if (autoLockSecondsLeft <= 0) {
        clearAutoLockTimer();
        convertState.update(s => ({ ...s, prepUnlocked: false }));
      }
    }, 1000);
  }

  $effect(() => {
    if ($convertState.prepUnlocked && hasContent) startAutoLockTimer();
    else clearAutoLockTimer();
    return () => clearAutoLockTimer();
  });

  function requestUnlockOrLock() {
    if (prepLocked) confirmingUnlock = true;
    else convertState.update(s => ({ ...s, prepUnlocked: false }));
  }

  function confirmUnlock() {
    convertState.update(s => ({ ...s, prepUnlocked: true }));
    confirmingUnlock = false;
  }

  function cancelUnlock() { confirmingUnlock = false; }
</script>

{#if hasContent}
  <button
    type="button"
    class="prep-lock-btn"
    class:locked={prepLocked}
    class:unlocked={!prepLocked}
    onclick={requestUnlockOrLock}
    title={prepLocked
      ? 'Locked — click to unlock prep settings (with confirmation)'
      : `Unlocked — auto-locks in ${autoLockSecondsLeft}s. Click to re-lock now.`}
    aria-label={prepLocked ? 'Unlock prep settings' : 'Re-lock prep settings'}
  >
    {#if prepLocked}
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="7" width="10" height="7" rx="1"/>
        <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
      </svg>
    {:else}
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="7" width="10" height="7" rx="1"/>
        <path d="M5 7V5a3 3 0 0 1 5.4-1.8"/>
      </svg>
    {/if}
  </button>
  {#if !prepLocked && autoLockSecondsLeft > 0}
    <span class="prep-lock-countdown" title="Auto-locks after 60 seconds of inactivity">{autoLockSecondsLeft}s</span>
  {/if}
{/if}

{#if confirmingUnlock}
  <div class="prep-lock-overlay" role="dialog" aria-modal="true" aria-labelledby="prep-unlock-title">
    <div class="prep-lock-box">
      <p class="prep-lock-title" id="prep-unlock-title">Unlock JSONL prep settings?</p>
      <p class="prep-lock-sub">
        Once data is generated, the template / system prompt / chunk size / role-mapping settings
        are locked to keep your output consistent. Unlocking lets you change them — the next
        regeneration will use the new values.
      </p>
      <div class="prep-lock-actions">
        <button class="prep-lock-confirm danger" onclick={confirmUnlock}>unlock</button>
        <button class="prep-lock-confirm" onclick={cancelUnlock}>cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Lock button — matches the preset lock icon styling: icon-only, no border,
     red when locked, green when unlocked. */
  .prep-lock-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 2px;
    padding: 3px 6px;
    cursor: pointer;
    transition: background 0.1s;
    flex-shrink: 0;
  }
  .prep-lock-btn svg { flex-shrink: 0; }
  .prep-lock-btn.locked { color: var(--err); }
  .prep-lock-btn.locked:hover { background: color-mix(in srgb, var(--err) 12%, transparent); }
  .prep-lock-btn.unlocked { color: var(--ok); }
  .prep-lock-btn.unlocked:hover { background: color-mix(in srgb, var(--ok) 12%, transparent); }

  .prep-lock-countdown {
    font-size: 11px;
    color: var(--ok);
    font-variant-numeric: tabular-nums;
    margin-left: 2px;
    cursor: help;
    min-width: 24px;
  }

  /* Confirmation modal */
  .prep-lock-overlay {
    position: fixed;
    inset: 0;
    z-index: 600;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .prep-lock-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 22px 26px;
    width: calc(100vw - 32px);
    max-width: 460px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prep-lock-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    margin: 0;
  }
  .prep-lock-sub {
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.5;
    margin: 0;
  }
  .prep-lock-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }
  .prep-lock-confirm {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 14px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
  }
  .prep-lock-confirm:hover { color: var(--ink); border-color: var(--ink-dim); }
  .prep-lock-confirm.danger { color: var(--err); border-color: var(--err); }
  .prep-lock-confirm.danger:hover { background: color-mix(in srgb, var(--err) 12%, transparent); }
</style>
