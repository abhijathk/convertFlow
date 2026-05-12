# convertFlow

An in-browser tool for preparing LLM training data, RAG document chunks, and quick text utilities. Everything runs locally — no files leave your machine.

Built with Astro + Svelte 5 + TypeScript + Monaco + TailwindCSS.

## Quick start

```bash
npm install
npm run dev    # http://localhost:4321
```

```bash
npm run build  # production build → ./dist
npm run preview
npm test       # vitest
npx tsc --noEmit
```

Requires Node ≥ 22.12.

## What's in it

Four tabs (`⌘1` – `⌘4`):

### 1. Convert
Paste, drop, or import (PDF / DOCX / XLSX / CSV / TSV / TXT / MD / images via OCR) and export to **JSONL, JSON, CSV, TSV, Parquet, Markdown, plain text, Alpaca, or ShareGPT**.

- 51 fine-tuning presets across OpenAI, Anthropic, Google, Meta, Mistral, xAI, DeepSeek, Cohere, Microsoft, Alibaba, IBM, BigCode, TII, 01.AI — picked via provider → model two-list dropdown.
- Auto-fix per validation error (jsonrepair, missing wrappers, unknown role, missing content/role, forbidden field).
- Preset-diff preview: switching presets warns if it produces new errors.
- Multi-file dataset panel: drag-reorder, multi-select bulk actions, per-file format override.
- Push directly to a Hugging Face Hub dataset repo (your token, your repo).
- Sampling for >500-row files (configurable) — view stays responsive, validation still sees the full content.

### 2. Chunk
Split documents into embedding-ready chunks with metadata.

- Fixed / paragraph / semantic (beta, BoW similarity) strategies.
- Manual chunk-boundary editing — drag split lines in the source view.
- Overlap visualizer — blue/orange highlights show the bytes shared with neighboring chunks.
- Live embedding-cost estimate across providers (`embedders.json`).

### 3. Editor
Full Monaco editor with multi-file workspace.

- Split-pane preview with all export formats.
- Diff view (source ↔ generated) via Monaco diff editor.
- Cross-file Find & Replace, regex + case toggles, replace-all-across-files.
- Live linter on `.jsonl` files (click problem → jump to line).
- Per-record token gutter (toggleable, debounced).
- Format-on-paste detection (JSON array → JSONL).
- Read-only toggle per file.
- Toast undo on destructive transforms (sort / dedupe / trim / normalize / case / convert-to-*).

### 4. Utilities
14 lightweight tools, lazy-loaded via `import.meta.glob`:

| Category | Tools |
|---|---|
| LLM | Token Estimator · Cost Calculator (46 models) · Token-per-row Analyzer · Embedding Budget Estimator |
| Data | JSON / JSONL Validator · Dataset Splitter (seeded shuffle) |
| Text | Text Transformer · Prompt Template Expander · Conversation Formatter |
| Validation | Regex Tester · Duplicate Detector |
| Encoding | Base64 / URL Encode-Decode |
| Utility | Hash Generator (Web Crypto) · Timestamp Converter |

Every tool (except Timestamp) supports three input sources: paste, **↑ Upload file**, or **↳ Use Editor selection**. Auto-prefill seeds eligible tools from the active Editor file on tab activation (100KB cap, with "Load full file" escape).

Send-to actions push results back to Editor / Convert / Chunk. Cross-utility hand-off (Token Estimator → Cost Calculator) and reverse "↗ Utilities" entries from Convert / Chunk / Editor toolbars.

## Cross-cutting features

- **IDE-style command palette** (`⌘K`) — centered text input in the topbar; dropdown filters live and anchors directly beneath. Includes export-format switches, chunk strategy/size presets, Editor toggles, and per-utility launchers.
- **URL share state** — encodes Convert / Chunk / Editor state in the URL fragment via `lz-string` for shareable links.
- **First-visit tour** — 6 highlighted steps, edge-aware tooltip positioning.
- **Settings popover** (gear icon) — syntax theme, editor (word wrap / minimap / font size + live syntax preview), convert (sample threshold / default preset), privacy (telemetry opt-out / clear HF token / clear all stored data).
- **Auto-save** to localStorage (per-tab) with 3MB-per-file cap and QuotaExceededError handling.
- **Privacy-first**: explicit "all processing in-browser" footer; all `dataprep*` localStorage keys removable in one click.

## Project layout

```
src/
├── components/
│   ├── ConvertTab.svelte           Convert tab
│   ├── ChunkTab.svelte             Chunk tab
│   ├── EditorTab.svelte            Editor tab
│   ├── UtilitiesTab.svelte         Utilities tab
│   ├── UtilityToolPanel.svelte     Per-tool dispatch wrapper
│   ├── utilities/*.svelte          14 per-tool view components
│   ├── TopBar.svelte               Brand · command palette · actions
│   ├── TabStrip.svelte             4 tabs + settings (gear) popover
│   ├── StatusBar.svelte            Tab-specific footer
│   ├── CommandPalette.svelte       Dropdown anchored to cmd-input
│   ├── Tour.svelte                 First-visit guided tour
│   ├── HfHubPushDialog.svelte      Hugging Face Hub push
│   └── …
├── lib/
│   ├── utilities/
│   │   ├── registry.ts             Lazy-loading registry + runUtility()
│   │   ├── types.ts                UtilityPayload / UtilityResult / Module
│   │   └── tools/*.ts              14 tool modules (lazy chunks via import.meta.glob)
│   ├── format-convert.ts           Format builders (jsonl/json/csv/tsv/md/…)
│   ├── chunk.ts                    Chunking strategies (returns RawChunk[])
│   ├── auto-fix.ts                 Validation-error auto-repair
│   ├── validate.ts                 Per-preset JSONL validation
│   ├── pricing.ts                  Embedding & fine-tune pricing helpers
│   ├── share-url.ts                lz-string fragment encode/decode
│   ├── hf-hub.ts                   Hugging Face Commits API client
│   └── …
├── stores/
│   ├── shellState.ts               Active tab · palette · paletteQuery
│   ├── editorState.ts              Open files · pendingJump · editorSelection
│   ├── convertState.ts             Dataset · preset · format settings
│   ├── chunkState.ts               Strategy · embedder · chunks
│   ├── utilitiesState.ts           Per-tool input + auto-prefill state
│   └── appSettings.ts              Theme · editor · convert · privacy prefs
├── workers/
│   └── tokenize.worker.ts          js-tiktoken in a worker
└── pages/
    ├── index.astro                 Main app shell
    ├── help.astro                  Full feature documentation
    └── privacy.astro               Privacy policy
```

## Tech stack

- **Astro 6** with the `@astrojs/svelte` integration
- **Svelte 5** runes (`$state`, `$derived`, `$effect`, `$props`)
- **TypeScript** strict mode
- **Monaco editor** (lazy-loaded with `vite-plugin-monaco-editor`)
- **TailwindCSS 4** via `@tailwindcss/vite`
- **In-browser parsers**: `pdfjs-dist`, `mammoth` (DOCX), `xlsx`, `tesseract.js` (OCR)
- **Tokenization**: `js-tiktoken` (worker for exact counts)
- **Compression**: `lz-string` (URL share state), `apache-arrow` + `parquet-wasm` (Parquet export)
- **Repair / shuffle**: `jsonrepair`, `seedrandom`
- **Deployment**: Cloudflare Pages (`wrangler.toml`)

## Privacy

All work happens locally:

- Files are parsed in-browser via WASM. They are never uploaded.
- localStorage stores in-progress work — clear it any time via Settings → Privacy → Clear all stored data.
- Two opt-in network paths: Hugging Face Hub push (your token, your repo) and cookieless Plausible analytics (disable via Settings).

See `/privacy` in the running app or `src/pages/privacy.astro` for the full policy.

## Contact

[support@quakkainfo.com](mailto:support@quakkainfo.com)

## License

Private project. All rights reserved.
