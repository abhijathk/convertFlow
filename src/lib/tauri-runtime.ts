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
 * Wires the confirm-on-exit handler. When the user closes the window and has
 * `desktopConfirmExit` enabled in appSettings, Rust prevents the close and
 * emits `desktop://request-exit`. We catch it here, ask the user, and either
 * call `destroy` to actually close or do nothing to keep the window.
 */
export async function wireDesktopExitConfirm(): Promise<void> {
  if (!isDesktop()) return;
  const invoke = getInvoke();
  const event = getEvent();
  if (!invoke || !event) return;

  await event.listen('desktop://request-exit', async () => {
    const ok = window.confirm('Close convertFlow?');
    if (ok) {
      // Force-close the window. core:window:allow-destroy is implicit in
      // core:window:default so this works with our capability set.
      await invoke('plugin:window|destroy').catch(() => { /* ignore */ });
    }
  });
}
