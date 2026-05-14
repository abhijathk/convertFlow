<script lang="ts">
  import { appSettings } from '../stores/appSettings';
  import { isDesktop } from '../lib/tauri-runtime';

  let visible = $derived($appSettings.showSupportPanel);

  function dismiss() {
    appSettings.update(s => ({ ...s, showSupportPanel: false }));
  }

  const desktop = isDesktop();

  async function openExternal(url: string) {
    if (desktop) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  const supportUrl = desktop ? 'https://convertflow.live/support' : '/support';
  const adsUrl = desktop ? 'https://convertflow.live/support#ads' : '/support#ads';
</script>

{#if visible}
  <aside class="support-panel" role="complementary" aria-label="Support convertFlow">
    <div class="support-section coffee">
      <span class="support-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h8v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Z"/>
          <path d="M11 7h1.5a1.5 1.5 0 0 1 0 3H11"/>
          <path d="M5 2v2M7 2v2M9 2v2"/>
        </svg>
      </span>
      <div class="support-text">
        <span class="support-title">Free, no signup, no tracking.</span>
        <span class="support-sub">If convertFlow saved you time, a coffee helps keep it that way.</span>
      </div>
      <button class="support-cta" onclick={() => openExternal(supportUrl)}>
        Support →
      </button>
    </div>
    <div class="support-divider" aria-hidden="true"></div>
    <div class="support-section ad-slot" aria-label="Sponsored">
      <span class="ad-label" aria-hidden="true">sponsored</span>
      <span class="ad-placeholder">
        Your tool here — <button class="ad-link-btn" onclick={() => openExternal(adsUrl)}>place an ad</button>
      </span>
    </div>
    <button class="support-dismiss" onclick={dismiss} title="Hide this panel (re-enable in Settings)" aria-label="Dismiss support panel">×</button>
  </aside>
{/if}

<style>
  .support-panel {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 16px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    font-size: 12px;
    flex-shrink: 0;
    position: relative;
  }
  .support-section {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .support-section.coffee { flex: 1 1 auto; }
  .support-section.ad-slot { flex: 0 1 auto; max-width: 360px; opacity: 0.7; }

  .support-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
  .support-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .support-title { color: var(--ink); font-weight: 500; }
  .support-sub   { color: var(--ink-dim); font-size: 11px; }

  .support-cta {
    flex-shrink: 0;
    color: var(--accent);
    text-decoration: none;
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-radius: 3px;
    padding: 4px 10px;
    font-weight: 500;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    transition: background 0.1s;
  }
  .support-cta:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

  .support-divider {
    width: 1px;
    height: 28px;
    background: var(--border);
    flex-shrink: 0;
  }

  .ad-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 1px 5px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .ad-placeholder {
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ad-placeholder a { color: var(--accent); text-decoration: none; }
  .ad-placeholder a:hover { text-decoration: underline; }
  .ad-link-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--accent);
    font-family: inherit;
    font-size: inherit;
    text-decoration: none;
  }
  .ad-link-btn:hover { text-decoration: underline; }

  .support-dismiss {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .support-dismiss:hover { color: var(--ink); background: var(--bg); }

  @media (max-width: 700px) {
    .support-panel { flex-wrap: wrap; }
    .support-divider { display: none; }
    .support-section.ad-slot { display: none; }
  }
</style>
