<script lang="ts">
  import { appSettings } from '../stores/appSettings';
  import { shellState } from '../stores/shellState';
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

  function handleBannerClick(e: MouseEvent) {
    e.preventDefault();
    openExternal('https://retroarcadegames.games/');
  }

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
    </div>
    <div class="support-divider" aria-hidden="true"></div>
    <div class="support-section ad-slot" aria-label="Sponsored">
      <span class="ad-label" aria-hidden="true">sponsored</span>

      <!-- Live sponsor: RETRO-BOX (retroarcadegames.games) — swaps dark/light per theme -->
      <a
        class="retro-banner retro-banner-{$shellState.theme}"
        href="https://retroarcadegames.games/"
        target="_blank"
        rel="noopener noreferrer sponsored"
        onclick={handleBannerClick}
        aria-label="RETRO-BOX — play 24 classic arcade games free, opens retroarcadegames.games"
      >
        <span class="retro-corner retro-tl"></span>
        <span class="retro-corner retro-tr"></span>
        <span class="retro-corner retro-bl"></span>
        <span class="retro-corner retro-br"></span>

        <span class="retro-id">
          <span class="retro-brand">RETRO-<span>BOX</span></span>
          <span class="retro-sub">FREE · BROWSER · NO ADS<br>IN GAME</span>
        </span>

        <span class="retro-icons">
          <span class="retro-icon-cell">
            <svg width="22" height="22" viewBox="0 0 8 8" style="image-rendering:pixelated">
              <rect x="1" y="3" width="5" height="1" class="retro-fill-1"/>
              <rect x="1" y="4" width="2" height="1" class="retro-fill-1"/>
              <rect x="5" y="4" width="2" height="3" class="retro-fill-1"/>
              <rect x="1" y="5" width="1" height="1" class="retro-fill-1"/>
            </svg>
            <span class="retro-ic-lbl">SNAKE</span>
          </span>
          <span class="retro-icon-cell">
            <svg width="22" height="22" viewBox="0 0 8 8" style="image-rendering:pixelated">
              <rect x="3" y="1" width="2" height="1" class="retro-fill-2"/>
              <rect x="2" y="2" width="4" height="1" class="retro-fill-2"/>
              <rect x="1" y="3" width="6" height="2" class="retro-fill-2"/>
              <rect x="2" y="6" width="1" height="1" class="retro-fill-2"/>
              <rect x="5" y="6" width="1" height="1" class="retro-fill-2"/>
            </svg>
            <span class="retro-ic-lbl">TETRIS</span>
          </span>
          <span class="retro-icon-cell">
            <svg width="22" height="22" viewBox="0 0 8 8" style="image-rendering:pixelated">
              <rect x="1" y="3" width="2" height="2" class="retro-fill-3"/>
              <rect x="5" y="3" width="2" height="2" class="retro-fill-3"/>
              <rect x="3" y="1" width="2" height="6" class="retro-fill-3"/>
            </svg>
            <span class="retro-ic-lbl">PONG</span>
          </span>
          <span class="retro-icon-cell">
            <svg width="22" height="22" viewBox="0 0 8 8" style="image-rendering:pixelated">
              <rect x="2" y="1" width="4" height="1" class="retro-fill-4"/>
              <rect x="1" y="2" width="1" height="4" class="retro-fill-4"/>
              <rect x="6" y="2" width="1" height="4" class="retro-fill-4"/>
              <rect x="2" y="6" width="4" height="1" class="retro-fill-4"/>
              <rect x="3" y="3" width="2" height="2" class="retro-fill-4"/>
            </svg>
            <span class="retro-ic-lbl">MORE</span>
          </span>
        </span>

        <span class="retro-mid">
          <span class="retro-tag1">Play <em>24 classic arcade games</em> — free, forever</span>
          <span class="retro-tag2">No sign-up · no plugins · no cost · instant play in browser</span>
        </span>

        <span class="retro-cta">
          <span class="retro-play-arrow">►</span>
          <span class="retro-cta-btn">PLAY NOW</span>
        </span>
      </a>

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

  /* ── RETRO-BOX sponsored banner — 600 × 60, dark/light per app theme ───── */
  .retro-banner {
    width: 600px;
    height: 60px;
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    font-family: 'Courier New', 'Courier', monospace;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    text-decoration: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .retro-banner-dark {
    background: #111;
    border: 1px solid #2a2a2a;
    box-shadow: 2px 2px 0 #000;
  }
  .retro-banner-dark:hover {
    border-color: #555;
  }
  .retro-banner-light {
    background: #e8dfc8;
    border: 1px solid #b8a878;
    box-shadow: 2px 2px 0 #b8a878;
  }
  .retro-banner-light:hover {
    border-color: #8a7848;
    box-shadow: 2px 2px 0 #8a7848;
  }

  .retro-corner {
    position: absolute;
    width: 4px;
    height: 4px;
  }
  .retro-banner-dark .retro-corner { background: #333; }
  .retro-banner-light .retro-corner { background: #8a7848; }
  .retro-tl { top: 0; left: 0; }
  .retro-tr { top: 0; right: 0; }
  .retro-bl { bottom: 0; left: 0; }
  .retro-br { bottom: 0; right: 0; }

  /* Brand block */
  .retro-id {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 14px;
    flex-shrink: 0;
    width: 142px;
  }
  .retro-banner-dark .retro-id { border-right: 1px solid #222; }
  .retro-banner-light .retro-id { border-right: 1px solid #c8b888; }
  .retro-brand {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1;
  }
  .retro-banner-dark .retro-brand { color: #e8e8e0; }
  .retro-banner-light .retro-brand { color: #2a2010; }
  .retro-brand :global(span) { /* the "BOX" half */ }
  .retro-banner-dark .retro-brand :global(span) { color: #c8962a; }
  .retro-banner-light .retro-brand :global(span) { color: #c87820; }
  .retro-sub {
    font-size: 7px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .retro-banner-dark .retro-sub { color: #444; }
  .retro-banner-light .retro-sub { color: #8a7848; }

  /* Game icons */
  .retro-icons {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
  }
  .retro-banner-dark .retro-icons { border-right: 1px solid #222; }
  .retro-banner-light .retro-icons { border-right: 1px solid #c8b888; }
  .retro-icon-cell {
    width: 38px;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .retro-banner-dark .retro-icon-cell { border-right: 1px solid #1c1c1c; }
  .retro-banner-light .retro-icon-cell { border-right: 1px solid #d8c898; }
  .retro-banner-dark .retro-icon-cell:last-child,
  .retro-banner-light .retro-icon-cell:last-child { border-right: none; }
  .retro-ic-lbl {
    font-size: 6px;
    letter-spacing: 0.06em;
    font-weight: 700;
  }
  .retro-banner-dark .retro-ic-lbl { color: #444; }
  .retro-banner-light .retro-ic-lbl { color: #8a7848; }

  /* Pixel-art SVG fills swap per theme */
  .retro-banner-dark :global(.retro-fill-1) { fill: #c8962a; }
  .retro-banner-light :global(.retro-fill-1) { fill: #c87820; }
  .retro-banner-dark :global(.retro-fill-2) { fill: #3a9870; }
  .retro-banner-light :global(.retro-fill-2) { fill: #3a7860; }
  .retro-banner-dark :global(.retro-fill-3) { fill: #9860d8; }
  .retro-banner-light :global(.retro-fill-3) { fill: #7848c8; }
  .retro-banner-dark :global(.retro-fill-4) { fill: #d84820; }
  .retro-banner-light :global(.retro-fill-4) { fill: #c84820; }

  /* Tagline */
  .retro-mid {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 14px;
    overflow: hidden;
    min-width: 0;
  }
  .retro-tag1 {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .retro-banner-dark .retro-tag1 { color: #e8e8e0; }
  .retro-banner-light .retro-tag1 { color: #2a2010; }
  .retro-tag1 :global(em) {
    font-style: normal;
  }
  .retro-banner-dark .retro-tag1 :global(em) { color: #c8962a; }
  .retro-banner-light .retro-tag1 :global(em) { color: #c87820; }
  .retro-tag2 {
    font-size: 7px;
    letter-spacing: 0.04em;
    margin-top: 3px;
    white-space: nowrap;
  }
  .retro-banner-dark .retro-tag2 { color: #444; }
  .retro-banner-light .retro-tag2 { color: #7a6838; }

  /* PLAY NOW CTA */
  .retro-cta {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 14px;
    gap: 8px;
  }
  .retro-banner-dark .retro-cta { border-left: 1px solid #222; }
  .retro-banner-light .retro-cta { border-left: 1px solid #c8b888; }
  .retro-play-arrow {
    font-size: 13px;
    flex-shrink: 0;
  }
  .retro-banner-dark .retro-play-arrow { color: #c8962a; }
  .retro-banner-light .retro-play-arrow { color: #c87820; }
  .retro-cta-btn {
    font-family: 'Courier New', 'Courier', monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 7px 13px;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .retro-banner-dark .retro-cta-btn {
    background: #e8e8e0;
    color: #111;
    border: 1px solid #e8e8e0;
  }
  .retro-banner-dark:hover .retro-cta-btn {
    background: #111;
    color: #e8e8e0;
    border-color: #e8e8e0;
  }
  .retro-banner-light .retro-cta-btn {
    background: #2a2010;
    color: #e8dfc8;
    border: none;
  }
  .retro-banner-light:hover .retro-cta-btn {
    background: #3a3020;
    color: #e8dfc8;
  }

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

  /* On narrow desktops, drop the 600px banner but keep the
     "sponsored" badge so the slot is still recognisable. */
  @media (max-width: 1000px) {
    .retro-banner { display: none; }
  }
  @media (max-width: 700px) {
    .support-panel { flex-wrap: wrap; }
    .support-divider { display: none; }
    .support-section.ad-slot { display: none; }
  }
</style>
