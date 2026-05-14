// Small runtime helper for Tauri-specific behavior. Imported once from the
// app shell (index.astro). All API calls are guarded so it does nothing
// in the web build.

export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function getInvoke(): TauriInternals['invoke'] | null {
  if (!isDesktop()) return null;
  const ti = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  return ti?.invoke ?? null;
}

interface TauriEvent {
  listen: (event: string, handler: (payload: unknown) => void) => Promise<() => void>;
}

function getEvent(): TauriEvent | null {
  if (!isDesktop()) return null;
  // The event plugin exposes a global on window when loaded.
  return (window as unknown as { __TAURI__?: { event?: TauriEvent } }).__TAURI__?.event ?? null;
}

/**
 * Wires the close-request handler. Rust always prevents the OS close and
 * emits `desktop://request-exit`. We then:
 *   1. Read `desktopConfirmExit` from localStorage
 *   2. If true → confirm() prompt; if user says no, do nothing (window stays open)
 *   3. If false (default) → close immediately
 * Either way, the actual close is done by `plugin:window|destroy`.
 */
export async function wireDesktopExitConfirm(): Promise<void> {
  if (!isDesktop()) return;
  const invoke = getInvoke();
  const event = getEvent();
  if (!invoke || !event) return;

  await event.listen('desktop://request-exit', async () => {
    let confirmExit = false;
    try {
      const raw = localStorage.getItem('dataprep:appSettings');
      if (raw) {
        const parsed = JSON.parse(raw) as { desktopConfirmExit?: boolean };
        confirmExit = !!parsed.desktopConfirmExit;
      }
    } catch { /* ignore */ }

    if (confirmExit) {
      const ok = window.confirm('Close convertFlow?');
      if (!ok) return; // user cancelled — keep the window open
    }
    await invoke('plugin:window|destroy').catch(() => { /* ignore */ });
  });
}
