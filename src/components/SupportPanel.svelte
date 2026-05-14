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
      <!--
        Sponsored banner slot — replace the .ad-frame block below with:
          <a class="ad-frame ad-frame-live" href="https://sponsor.example/?ref=convertflow" target="_blank" rel="noopener noreferrer sponsored">
            <img src="/sponsors/example.png" width="600" height="60" alt="Sponsor name — tagline" />
          </a>
        Banner spec: 600 × 60 px, PNG or SVG, < 50 KB, dark-friendly.
      -->
      <div class="ad-frame" aria-label="Empty banner — 600 by 60 pixels">
        <span class="ad-frame-title">Your 600 × 60 banner here</span>
      </div>
      <button class="ad-advertise" onclick={() => openExternal(adsUrl)} aria-label="Advertise here — opens advertising info">
        Advertise →
      </button>
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
  .support-section.coffee { flex: 1 1 auto; min-width: 220px; }
  .support-section.ad-slot { flex: 1 1 auto; justify-content: flex-end; min-width: 0; gap: 10px; }

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
    letter-spacing: 0.1em;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    padding: 2px 7px;
    border-radius: 3px;
    font-weight: 600;
    flex-shrink: 0;
  }

  /* 600 × 60 banner frame — placeholder visible until a real <a class="ad-frame ad-frame-live"> replaces it */
  .ad-frame {
    flex: 0 1 600px;
    width: 600px;
    max-width: 100%;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--border) 30%, transparent);
    border: 1px dashed color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 4px;
    overflow: hidden;
    text-decoration: none;
  }
  .ad-frame :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ad-frame-live {
    border-style: solid;
    background: transparent;
    cursor: pointer;
  }
  .ad-frame-title {
    font-size: 11px;
    color: var(--ink-dim);
    letter-spacing: 0.02em;
    padding: 0 10px;
    text-align: center;
  }

  .ad-advertise {
    flex-shrink: 0;
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    color: var(--accent);
    padding: 5px 12px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    transition: background 0.1s;
  }
  .ad-advertise:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

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

  /* On narrow desktops, drop the 600px banner frame but keep the
     "sponsored" badge + Advertise CTA so the slot is still functional. */
  @media (max-width: 1000px) {
    .ad-frame { display: none; }
  }
  @media (max-width: 700px) {
    .support-panel { flex-wrap: wrap; }
    .support-divider { display: none; }
    .support-section.ad-slot { display: none; }
  }
</style>
