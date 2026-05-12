# DESIGN.md — DataPrep

> Source of truth for the visual system. Tailwind theme reads from the CSS variables defined here — never hardcode hex in components.
>
> At Phase 1A of the port, copy this file to the Astro project root. Keep it current — stale design docs are worse than none.

## Direction

**IDE-console aesthetic.** Not "copy VS Code" — adopt the conventions developers already recognize. Monospace-first. Dark default. Sharp edges. Minimal chrome. Keyboard-first. Every decision answers: "does this look like a respected dev utility, or a SaaS template?"

Reference tools: **Warp** (terminal), **Raycast** (palette), **Zed** (editor), **Deno docs**, **v0 by Vercel**, **Supabase SQL editor**.

Two tabs under the same shell:
- **Convert** — paste JSONL, see tokens + per-provider fine-tuning cost. 100% browser.
- **Chunk** — drop PDF/DOCX/XLSX/JSON, see chunks with RAG metadata + per-chunk embedding cost. Hybrid (one Cloudflare Pages Function parses the file, everything else runs in the browser).

---

## Tokens

### Typography

One family in the tool UI. Variable weight.

| Role | Font | Fallback stack |
|---|---|---|
| Everything in the tool (editor, status bar, palette, forms, buttons, captions, errors) | **IBM Plex Mono** 400 / 500 / 600 | `'IBM Plex Mono', 'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` |
| Long-form body (blog, comparison pages, privacy, about) | **Inter Tight** 400 / 500 | `'Inter Tight', system-ui, sans-serif` |
| Numbers (token count, cost, chunk count, density) | Same monospace, `font-variant-numeric: tabular-nums` always on |

Host both fonts locally in `public/fonts/` (woff2). Never use Google Fonts CDN — privacy + reliability.

**Size scale:** `12px · 13px · 14px · 16px · 20px · 24px`. Use these, nothing else. No 18px.

| Context | Size |
|---|---|
| Editor body | 14px |
| Status bar | 12px |
| Tab labels | 13px |
| Buttons, kbd hints | 13px |
| Page H1 | 24px |
| Page H2 | 20px |
| Inline captions (`verified YYYY-MM-DD`, `--ink-dim` hints) | 12px |

### Color

CSS variables only. Tailwind reads from these in `tailwind.config.ts`. Every value must have a dark + light pair.

```css
:root {
  /* Dark (default) */
  --bg:           #0e1116;
  --surface:      #161a21;
  --ink:          #e6e1d7;
  --ink-dim:      #a8a296;
  --muted:        #6b6558;
  --accent:       #e0a84e;  /* warm amber — cost badge, primary actions, kbd glyphs */
  --ok:           #8ab56b;
  --err:          #e07575;
  --warn:         #d4a24a;
  --syntax-key:   #7ab0d8;
  --syntax-str:   #c5a46c;
  --syntax-num:   #b08fe8;
  --syntax-punct: #a8a296;
  --border:       #242933;
}

[data-theme="light"] {
  --bg:           #f6f5ef;
  --surface:      #ffffff;
  --ink:          #1a1d21;
  --ink-dim:      #57606a;
  --muted:        #8a8a8a;
  --accent:       #b5710f;
  --ok:           #2e7d32;
  --err:          #b4261e;
  --warn:         #8a6d15;
  --syntax-key:   #1c5a8a;
  --syntax-str:   #8a5a10;
  --syntax-num:   #5e37a1;
  --syntax-punct: #57606a;
  --border:       #e2dfd5;
}
```

**Accent is warm amber, not blue.** Blue is the SaaS-template default. Amber reads "terminal highlight" — the cost badge is the one warm signal on a cool surface; the eye cannot miss it.

### Spacing

4-based scale: `4px · 8px · 12px · 16px · 24px · 32px · 48px`. No odd values. No 20px or 40px.

Layout gaps:
- Top bar → preset bar: `0` (hairline border)
- Preset bar → editor: `0`
- Editor → problems panel / chunks list: `0`
- Panel → status bar: `0`
- Editor zone → below-fold content: `48px`
- Section → section below fold: `32px`
- Row → row inside a list: `8px`

### Radii

IDEs have sharp edges. Nothing bubbly.

| Element | Radius |
|---|---|
| Buttons | 2px |
| Inputs | 3px |
| Panels, rows, cards, banners | 4px |
| Pills (preset chips, keyword pills) | 999px — only place full-round is allowed |

### Borders

All hairlines are 1px `--border`. Focus rings: 2px `--accent` outline + 2px offset. Never remove focus rings.

### Motion

| What | When | How |
|---|---|---|
| Cost number update | Preset switch, exact calc | 150ms opacity crossfade |
| Palette open / close | `⌘K` | 100ms fade |
| Share button confirm | `⌘⇧C` success | 200ms green pulse |
| Chunks list expand | Row click / Enter | 100ms ease-out |
| Chunks list collapse | Row click / Enter | 80ms ease-in |
| Parse loading bar | Continuous | 60fps smooth, monotonic fill |
| Banner appear / dismiss | Share URL mismatch | 150ms fade |
| Strategy hint fade-out | 10s after first parse | 300ms fade |
| Tooltip | 300ms hover threshold | 200ms fade-in, 100ms fade-out |

**Zero scroll-linked animations. Zero decorative hover-to-reveal for primary info.** `prefers-reduced-motion: reduce` disables all of the above.

---

## Shell

Single layout for both tabs. Tab switch is local state, not a page navigation.

```
┌─ dataprep.tool ────────────────── theme ⌘T · cmd ⌘K · github ↗ ─┐  topbar 40px
├─ [ ⌘1 Convert ]  [ ⌘2 Chunk ]                                  ┤  tab strip 36px
├─ {tab-specific preset/strategy bar}                            ┤  preset bar 36px
│                                                                 │
│   {tab-specific editor / chunks list area}                      │  ~70% viewport
│                                                                 │
├─ {tab-specific problems panel or chunks panel, optional}       ┤
├─ {tab-specific status bar}                                     ┤  status bar 28px
└──────────────────────────────────────────────────────────────────┘
```

### TabStrip (`TabStrip.svelte`)

- Two buttons, equal width, aligned flush left.
- Active tab: `--ink` color, 500 weight, `--accent` 2px underline aligned with bottom border.
- Inactive tab: `--ink-dim` color, 400 weight, no underline. Hover: `--ink` color.
- Keyboard: `⌘1` / `⌘2` switch tabs. Arrow keys cycle when focus is on strip.
- A11y: `role="tablist"`, each tab `role="tab"` + `aria-selected`. Panel `role="tabpanel"` + `aria-labelledby`.

### Top bar

- Left: `dataprep.tool` brand mark (13px, weight 500, `--ink`). Links to `/`.
- Right: `theme ⌘T` · `cmd ⌘K` · `github ↗` — 12px, `--ink-dim`. `⌘T` and `⌘K` glyphs in `--accent`.

### Navigation dropdowns

`examples` and `compare` are dropdowns (not hover menus on mobile). Both dropdowns split into `Fine-tuning` and `RAG / Chunking` sub-headers so Chunk-tab landers discover Convert and vice-versa. Sub-header style: 11px `--muted`, uppercase, letter-spacing 0.05em. Desktop: dropdown on click, closes on outside click. Mobile: full-screen sheet, close button top-right.

### Status bar (`StatusBar.svelte`)

Sticky bottom. Shared shell, tab-specific slot contents.

- **Convert**: `N lines · N errors · valid:N/N    42,137t · ≈ $1.05 ⟶`
- **Chunk**: `N chunks · avg density 0.72    $0.42 embedding cost · semantic ⟶`

Left half `--ink-dim` 12px with `·` separators in `--muted`. Right half `--accent` 13px 500 weight, tabular numerals. Right arrow `⟶` is a "copy share" hint; clicking the right half triggers `⌘⇧C`.

### Command palette (`CommandPalette.svelte`)

- `⌘K` opens, `Esc` closes. Centered overlay, max-width 560px, top offset 180px. Overlay bg: `rgba(0,0,0,0.4)`.
- Action set is tab-aware: palette subscribes to `shellState.activeTab` and swaps its action source.
- Structure: input (14px, prefix `>`), divider, fuzzy-filtered list, "recent" sub-section.
- Row: left = action label (`--ink` default, `--accent` weight 500 on first result), right = kbd hint (`--ink-dim`). Hover / arrow-key focus: `--border` bg tint.
- A11y: `role="combobox"` with proper `aria-expanded`, `aria-controls`, and arrow-key list navigation.

### Tab-aware state

Three Svelte stores (`svelte/store`):

- `shellState` — `{ activeTab, theme, emailCaptured, modalOpen }`. Shell-owned.
- `convertState` — `{ editorContent, presetId, approximateTokens, exactTokens, cost, errors }`. Lazy-init on Convert tab first activation.
- `chunkState` — `{ editorContent, strategy, embedderId, chunks, metadata, parseStatus }`. Lazy-init on Chunk tab first activation.

Workers (tokenize, chunk) kept alive once initialized. Terminated on `beforeunload`. Tab switching does NOT teardown.

---

## Convert tab

### Preset bar

```
preset: ● openai-gpt-4.1 ▾         verified 2026-04-24
```

- Preset name 13px `--ink`, dot `●` in `--accent`, dropdown caret `▾`.
- `verified YYYY-MM-DD` right-aligned 12px `--ink-dim`. `⚠ verify` badge in `--warn` if `lastVerified` > 60 days.
- Full list opens as dropdown below, max-height 400px, scrollable.

### Editor (`EditorIsland.svelte` — Convert mode)

- CodeMirror 6 or Monaco (benchmark at port-time, pick smaller bundle).
- JSONL syntax highlight using `--syntax-*` tokens.
- Line numbers in gutter, 12px `--ink-dim`, tabular numerals.
- Inline red squiggly underlines on validation errors.
- **Empty state placeholder**:
  ```
  1 │ // paste your JSONL here
  2 │ // or press ⌘K → load example▮
  ```
  14px IBM Plex Mono, italic `--ink-dim`. Blinking cursor `▮` in `--accent`. Desktop only, below the placeholder: "(drop a .jsonl file anywhere in this editor)" at 12px `--muted`.

### Problems panel (`ProblemsPanel.svelte`)

- Hidden when 0 errors (keeps editor tall).
- Collapsible: `▸ PROBLEMS (N)` / `▾ PROBLEMS (N)`. Header row 32px.
- Each problem: `× line X  msg — suggestion  [fix ↵]`. Glyph `×` in `--err`, message `--ink` 13px, suggestion `--ink-dim` 12px, fix action button `--accent`.
- Click a row → editor jumps to that line.
- Green `✓ no problems` single-line when the paste is clean (no collapse/expand needed).

---

## Chunk tab

### Strategy picker (`ChunkStrategyPicker.svelte`) — segmented control, not cards

```
strategy: [ Fixed ] [ Paragraph ] [● Semantic ]
```

- Three inline buttons, equal width. Max width 360px.
- Active state: `--accent` 2px underline, weight 500. Inactive: weight 400, `--ink-dim`.
- Tooltip copy (300ms hover threshold, `--surface` bg + 1px `--border` + 3px radius, 12px Plex Mono, max-width 280px, 8px padding, positioned below):
  - **Fixed** — `Splits at token limits on sentence boundaries, with word overlap between chunks. Best for uniform chunk sizes when structure doesn't matter.`
  - **Paragraph** — `Respects paragraph and heading boundaries. Best when you want to preserve the document's structure.`
  - **Semantic** — `Groups related sentences by topic similarity. Best for topic-based retrieval on long, varied documents.`
- **Post-first-parse hint** (once per session, fades after 10s): 12px `--ink-dim` caption below the picker reading `chunks change with strategy — try all three`. Stops appearing once user has switched strategies ≥ 2 times in session (`shellState` flag).
- A11y: `role="radiogroup"`, each button `role="radio"` + `aria-checked`. Arrow keys cycle; Space/Enter selects.

### Embedder picker (`ChunkEmbedderPicker.svelte`)

- Radio list, same pattern as Convert's preset picker. One line per embedder: `name (13px --ink) · provider badge (11px --ink-dim) · verified YYYY-MM-DD (12px --ink-dim)`.
- Selected entry: `--accent` dot `●` in the leading gutter, weight 500.
- `⚠ verify` badge in `--warn` if `lastVerified` > 60 days.

### Metadata panel (`ChunkMetadataPanel.svelte`)

- Vertical form with monospace labels. Collapsible `▸`/`▾`. Collapsed by default on desktop.
- Fields: `doc_id`, `category`, `content_type`, `tags` (comma-separated), `author`, `language`.
- Inputs: `--surface` bg, 1px `--border`, 3px radius, 14px Plex Mono. Placeholder `--muted`. No placeholder-as-label (labels always visible).
- Mobile (<640px): hidden. Opens as full-screen sheet via "Edit metadata →" link near status bar.

### Chunks list (`ChunksList.svelte`) — rows, not cards

```
│ [01] {"messages":[{"role":"system","content":"You are..."   ▆▆▆▆▆▆░░░  [ai] [ml] [train]  ⌘C │
│ [02] {"messages":[{"role":"user","content":"What is...      ▆▆▆▆▆░░░░  [data] [prep]       ⌘C │
│ [03] ~ chunk below density threshold ~                       ▆▆▆░░░░░░ ●  [short]           ⌘C │
```

- Row structure (left → right): `│ [index] [truncated-content 40ch] [density-bar 40px×2px] [keyword pills × up to 4] [copy-chunk ⌘C] │`.
- **Density bar**: always a 40px × 2px container. Fill = `density_score × 40px` on absolute 0–1 scale (consistent across docs, not ranked per-doc). If `density_score < 0.3`: bar color becomes `--warn` and a 4px amber dot appears to its right.
- **Keyword pills**: up to 4, 12px Plex Mono, `--surface` bg, 1px `--border`, 999px radius, 4px × 2px padding.
- **Row hover**: `--border` bg tint.
- **Expand interaction**: click row → expand in place (100ms ease-out), full chunk content rendered in monospace preserving source formatting. Click again → collapse (80ms ease-in). Keyboard: `↑` / `↓` navigates rows, `Space` / `Enter` toggles expand.
- **Copy**:
  - `⌘C` on focused row → copy chunk content as plain text (what vector DBs want).
  - `⌘⌥C` on focused row → copy full chunk JSON with metadata.
- **Mobile (<640px)**: density bar collapses to 5 glyph buckets `▁▂▃▄▅` in `--accent`; keywords truncate to 2 + `…`. Full-width rows.
- A11y: each row `role="button"` + `aria-expanded`. Expand/collapse state announced.

### Trust strip (`ChunkTrustStrip.svelte`)

```
files parsed on our server and discarded immediately · never stored, never logged · how we handle your files ↗
```

- One line at the top of the Chunk tab editor zone. 12px IBM Plex Mono, `--ink-dim`. `·` separators in `--muted`.
- Link "how we handle your files ↗" in `--ink` with underline on hover, routes to `/privacy`.
- `aria-label="Privacy policy — how we handle your files"` on the link for screen readers.
- Stays visible during loading AND during error states — it's the standing promise, not a conditional signal.

### Chunk tab empty state

```
┌─ Chunk tab (empty) ───────────────────────────────────────────┐
│ files parsed on our server and discarded immediately · privacy ↗│
├────────────────────────────────────────────────────────────────┤
│ strategy: [ Fixed ] [ Paragraph ] [● Semantic ]                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌─ drop a .pdf, .docx, or .xlsx here ───────────────────┐   │
│   │                                                        │   │
│   │    or press ⌘K → load example                          │   │
│   │    or paste markdown/text directly                     │   │
│   │                                                        │   │
│   │    14px IBM Plex Mono, --ink-dim, centered             │   │
│   │    dotted 1px --border, 60% viewport height            │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ — chunks · — cost                                      ⌘K      │
└────────────────────────────────────────────────────────────────┘
```

Mobile empty state substitutes the drop zone for a primary `[ upload file 📄 ]` button (44px+, `--accent` fill), with example chips row below (`[research paper]` `[policy doc]` `[meeting notes]`, horizontal scroll).

---

## Patterns (used across both tabs)

### Loading: parse progress strip

```
┌─ parsing research-paper.pdf ─────── ████████░░ 63% ──────────┐
   ↑ 12px Plex Mono --ink-dim      ↑ 2px --accent fill, --border rail
```

- Appears at top of editor zone, replacing the dotted drop zone.
- Client-side smoothed percentage, monotonic (never backtracks).
- If parse exceeds 3s, a second line appears: `this is taking longer than usual — hang tight`.
- On success: 200ms fade out, chunks list populates below.
- On failure: strip replaced with error row (below).

### Errors: inline rows

```
┌─ × this PDF looks scanned · OCR coming soon · [notify me ↵] ─┐
```

- `--surface` bg, 1px `--err` border, 3px radius.
- `×` glyph in `--err`, message in `--ink`, suggestion in `--ink-dim`.
- Primary action right-aligned, `--accent` text.
- Single line preferred; multi-line when the fix needs it (max 3 lines).
- **Never modals, never toasts.** Errors live where the thing that failed lives: status-bar failures stay in status bar, parse errors replace the progress strip, validation errors populate the Problems panel.

### Cross-tab share URL prompt: inline banner

When `t=` in URL fragment disagrees with the active tab, banner appears above the editor (below the preset bar). Not a modal — user's current editor stays intact.

```
┌─ ⓘ  this shared preview is for the Chunk tab · [ switch and load ⌘→ ]  [dismiss ×] ┐
```

- `--surface` bg, 1px `--accent` border, 3px radius, 14px Plex Mono.
- `switch and load` primary button: `--accent` text, right-arrow glyph.
- If user's current editor has ≥ 100 chars of content: switching shows a second inline confirm: `Your current {Convert|Chunk} content will be discarded. Continue? [Yes, switch] [Cancel]`.
- Dismiss removes the banner, URL fragment remains — refresh re-offers.
- A11y: `role="alert"` + `aria-live="polite"` for URL-mismatch detection announcement.

### Buttons

- Primary: `--accent` text on transparent bg + 1px `--accent` border OR `--accent` bg + `--bg` text. Pick per context density; tool UI uses the transparent variant, big CTAs use the filled variant.
- Secondary: `--ink` text + 1px `--border` + transparent bg.
- Ghost: `--ink-dim` text, no border, hover to `--ink`.
- All buttons 2px radius, 8px × 4px padding (13px labels), 12px × 6px padding (14px labels).

### Forms

- Inputs use `--surface` bg, 1px `--border`, 3px radius, 14px Plex Mono. Placeholder `--muted`.
- Labels always visible outside the input. Never placeholder-as-label.
- Error state: border → `--err`, focus ring → `--err`, error message below in `--err`.

---

## Responsive

### Breakpoints

| Range | Convert tab | Chunk tab |
|---|---|---|
| 0–640 mobile | Editor full-width. Problems panel collapses to a badge. Palette via status-bar button. | Upload button primary (44px+). Example chips. Metadata panel → full-screen sheet. Density bar → glyph buckets. |
| 641–1024 tablet | Editor + problems panel stacked. | Editor + chunks list stacked. Metadata panel visible but below fold. |
| 1025+ desktop | Full IDE: editor center, problems panel below. Palette via `⌘K`. (No sidebar rail at launch.) | Same with embedder/strategy pickers visible. |

Full mobile experience across both tabs. No "try on desktop" bailout.

### Soft keyboard behavior (mobile)

Editor auto-shrinks to stay visible. Status bar stays pinned above keyboard. Cost/chunk-count numbers always visible above the keyboard.

### Touch targets

44px minimum on mobile, even when visually smaller (use padding). No hover-to-discover on touch — every affordance is visible in its resting state.

---

## Accessibility

### Contrast

- Body text: 4.5:1 minimum.
- Status bar (cost + chunk count are critical info): 4.5:1 minimum.
- Syntax highlighting colors: 3:1 minimum for large text.
- Verify all `--accent` / `--bg` combinations in both themes with an audit tool.

### Keyboard

Every action reachable. Focus rings always visible. Shortcuts shown next to labels (VS Code convention).

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘1` / `⌘2` | Switch to Convert / Chunk tab |
| `⌘↵` / `Ctrl+Enter` | (Convert) Calculate exact tokens |
| `⌘⇧C` / `Ctrl+Shift+C` | Copy share link |
| `⌘T` / `Ctrl+T` | Toggle theme |
| `⌘/` / `Ctrl+/` | Focus editor |
| `?` | Shortcuts overlay |
| `Esc` | Close palette / overlay / banner |

**Chunk-specific:**

| Shortcut | Action |
|---|---|
| `⌘↑` / `⌘↓` | Previous / next chunk (focus navigation) |
| `Space` / `Enter` | Expand / collapse focused chunk |
| `⌘C` (on focused chunk) | Copy chunk content as plain text |
| `⌘⌥C` (on focused chunk) | Copy full chunk JSON with metadata |

### Screen readers

- Editor: `aria-label="JSONL dataset editor"` (Convert) / `"Chunker document editor"` (Chunk).
- Cost + chunk-count updates: `aria-live="polite"` so changes are announced.
- Problems panel: `role="alert"` on first error; following errors in the same list are `role="listitem"`.
- Command palette: `role="combobox"` + `aria-expanded` + arrow-key list navigation.
- TabStrip: `role="tablist"`, tabs `role="tab"` + `aria-selected`. Panels `role="tabpanel"` + `aria-labelledby`.
- StrategyPicker: `role="radiogroup"`, buttons `role="radio"` + `aria-checked`.
- ChunksList rows: `role="button"` + `aria-expanded`.
- Cross-tab banner: `role="alert"` + `aria-live="polite"`.
- Trust strip link: `aria-label="Privacy policy — how we handle your files"`.

### Color-independent signals

Errors use `×` glyph + red color + text. Never color alone.
Success uses `✓` glyph + green color + text.
Density warning uses amber dot + color change. Never color alone.

### Motion

`prefers-reduced-motion: reduce` disables all transitions and animations listed in the Motion section.

---

## AI-slop blacklist (what we reject)

IDE aesthetic inherently fails these patterns. Do not regress.

1. ❌ Purple / violet / indigo gradient backgrounds or blue-to-purple color schemes.
2. ❌ 3-column icon-in-colored-circle feature grid.
3. ❌ Icons in colored circles as section decoration.
4. ❌ Centered everything (`text-align: center` on everything).
5. ❌ Uniform bubbly border-radius > 6px.
6. ❌ Decorative blobs, floating circles, wavy SVG dividers.
7. ❌ Emoji as design elements. Allowed: `✓` `×` `⟶` `↵` `↗` `⌘` `⇧` `⌥` `▸` `▾`. That's it.
8. ❌ Colored left-border on cards.
9. ❌ Generic hero copy: "Welcome to", "Unlock the power of", "Your all-in-one solution".
10. ❌ Cookie-cutter section rhythm (hero → 3 features → testimonials → pricing → CTA).
11. ❌ `system-ui` / Inter / `-apple-system` as the PRIMARY tool-UI font.

---

## File-to-component map

For the implementer: which component file owns each piece of this design.

### Shell
- `src/components/TabStrip.svelte` — tab switcher
- `src/components/EditorIsland.svelte` — CodeMirror/Monaco wrapper, mode per tab
- `src/components/StatusBar.svelte` — per-tab slots
- `src/components/CommandPalette.svelte` — `⌘K`, per-tab action set
- `src/components/DarkModeToggle.svelte`
- `src/components/ShareButton.svelte` — both tabs

### Convert tab
- `src/components/ConvertPresetBar.svelte`
- `src/components/ConvertProblemsPanel.svelte`
- `src/components/ConvertCostBadge.svelte`

### Chunk tab
- `src/components/ChunkStrategyPicker.svelte`
- `src/components/ChunkEmbedderPicker.svelte`
- `src/components/ChunkMetadataPanel.svelte`
- `src/components/ChunksList.svelte`
- `src/components/ChunkTrustStrip.svelte`

### Pages
- `src/pages/index.astro` — shell defaulting to Convert
- `src/pages/chunk.astro` — shell defaulting to Chunk
- `src/pages/privacy.astro` — docs layout, 7 sections, < 2min read
- `src/pages/examples/[id].astro` — 3 Convert + 3 Chunk examples
- `src/pages/compare/[slug].astro` — 8-12 comparison pages with embedded tool
- `src/pages/blog/[slug].astro` — long-form articles

### Styles
- `src/styles/globals.css` — CSS variables from the Color section, Tailwind theme reads from these
- `tailwind.config.ts` — color + font-family + spacing extensions referencing CSS vars

---

## Verification checklist

Before merging any component PR:

- [ ] No hex literals in the component file. All colors via `--*` CSS variables.
- [ ] All text size is one of `12 · 13 · 14 · 16 · 20 · 24` px.
- [ ] All spacing is one of `4 · 8 · 12 · 16 · 24 · 32 · 48` px.
- [ ] All radii are `2 / 3 / 4 / 999` px.
- [ ] Primary typeface is `var(--font-mono)` (IBM Plex Mono). Long-form body is `var(--font-body)` (Inter Tight). No `system-ui`.
- [ ] `prefers-reduced-motion: reduce` respected (all transitions removable).
- [ ] Contrast verified 4.5:1 body / 4.5:1 cost / 3:1 syntax.
- [ ] Keyboard: every action reachable, focus ring visible, shortcut shown next to label.
- [ ] Color-independent: errors have glyph + color + text; density-low has dot + color.
- [ ] No card grid, no gradient bg, no icon-in-circle, no centered hero, no decorative emoji.
- [ ] Component matches the file-to-component map above.
