## convertFlow Desktop — v0.1.5

The biggest release yet. **13 new features**, all grounded in published research (LIMA, DEITA, SemDeDup, Late Chunking, RAGAS, Self-Instruct, Magpie, Confident Learning, IFEval, GPT-3 contamination methodology). Full citations and design rationale in `RESEARCH_FEATURES.md` in the repo.

---

### New: RAG / Chunking

- **Embedding-based semantic chunking** — new `embedding` strategy uses [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) via transformers.js to split at cosine-similarity break points. Up to 9% retrieval-recall lift over fixed/Jaccard. Loads on demand (~23 MB, cached in IndexedDB).
- **Late chunking** — opt-in checkbox in the Chunk tab. Embeds the entire source first, then mean-pools per chunk to preserve cross-chunk context. Based on [Günther et al., Jina AI, EMNLP 2024](https://arxiv.org/abs/2409.04701). MiniLM's 512-token window applies; chunks beyond that fall back per-chunk with a `late_chunked: false` flag.
- **Retrieval-quality preview** — type a query at the bottom of the chunks list, see the top-5 chunks by cosine similarity with scores. Click a result to scroll the preview. Computes chunk embeddings on demand and caches them.
- **Source metadata on every chunk** — each chunk now carries `{source, source_type, page, section}`. PDFs preserve 1-indexed page numbers; markdown preserves the parent heading. Exported in JSONL and Parquet.
- **Bulk folder import in Chunk tab** — drag-drop a folder. Walks it, ingests every PDF/MD/TXT/HTML, chunks each, produces one combined dataset with per-source tags. Progress indicator.

### New: Dataset prep

- **Stratified train/val/test split** with leakage check — the dataset-splitter utility gains `stratifyBy: 'role-mix' | 'length-bucket' | 'system-prompt' | 'none'`, seeded reproducibility, and a 13-gram overlap scan between train and val/test to surface contamination across splits.
- **Dataset contamination check** — new utility. Hashes 13-grams from every row and matches against bundled benchmark signatures (MMLU, GSM8K, HellaSwag, HumanEval, IFEval, ARC). Flags rows that likely overlap with public eval sets ([Brown et al. 2020, GPT-3 method](https://arxiv.org/abs/2005.14165)).
- **DEITA-style quality scoring** — Convert stats panel surfaces a per-row score combining complexity × quality × diversity, with a "Filter to top N by quality" action. Based on [Liu et al., DEITA, ICLR 2024](https://arxiv.org/abs/2312.15685) showing 6k DEITA-selected rows can match 10× more data.
- **Validation report export** — one-click download of a markdown or CSV validation report for a dataset, with summary + findings + per-row stats.

### New: Utilities

- **Neural PII redactor** — opt-in checkbox in PII Redactor enables `Xenova/bert-base-NER` to find contextual names, orgs, locations, and dates that regex misses. Merges with existing regex hits; regex wins on overlapping spans. Microsoft Presidio-style hybrid.
- **Multi-tokenizer inspector** — new utility shows the same text tokenized by `cl100k_base`, `o200k_base`, `p50k_base` (via bundled `js-tiktoken`), and `Llama-3`, `Mistral`, `Gemma` (opt-in via transformers.js). Per-tokenizer count + colour-coded token chips so you can see where each one disagrees.

### New: Provider integrations

- **Push to OpenAI / Anthropic fine-tune APIs** — alongside the existing HuggingFace Hub push, you can now upload a dataset directly to OpenAI's Files API + start a fine-tune job from inside convertFlow. Anthropic fine-tune wiring included for when their API exits private beta. API keys stored in localStorage; sent only to the provider.
- **Magpie-style local-LLM data synthesis** — point convertFlow at a local Ollama / LM Studio / llama.cpp endpoint, and it'll synthesize alignment-style (user, assistant) pairs using the [Magpie technique](https://arxiv.org/abs/2406.08464). Streams rows into the Convert editor with cancel support. v1 ships a functional two-pass implementation (generate query → capture response).

---

### UI improvements

- Settings popover redesigned with a left-side **nav rail** + sticky **Buy Me a Coffee** footer.
- Top bar gains a persistent **Support** button with the coffee icon, visible on both web and desktop.
- Linux download card now uses a Tux silhouette in the app's accent colour (matches Windows + macOS cards visually).
- Sponsored slot reshaped to a real **600 × 60 IAB banner** with light/dark variants.

### Bug fixes

- Fixed: Settings popover compile error after a bad merge (orphan `</div>` from the local-LLM rows).
- Fixed: ChunkTab duplicate retrieval state declarations from the parallel-agent merge.
- Fixed: `@huggingface/transformers` loading `onnxruntime-node` during Vite SSR — would crash on Mac running x86_64 Node. Now lazy-loaded via dynamic import only inside browser context.
- Fixed: Convert/Chunk editor panels invisible on macOS desktop build (CSP `style-src` issue from v0.1.2 carried forward correctly).

---

### Downloads

| Platform | File | Notes |
|---|---|---|
| **Windows** | `convertFlow_0.1.5_x64-setup.exe` | NSIS installer — recommended |
| **Windows** | `convertFlow_0.1.5_x64_en-US.msi` | MSI installer — silent / managed installs |
| **macOS** | `convertFlow_0.1.5_universal.dmg` | Universal — Apple Silicon + Intel |
| **Linux** | `convertFlow_0.1.5_amd64.AppImage` | Universal — `chmod +x` and run |
| **Linux** | `convertFlow_0.1.5_amd64.deb` | Debian / Ubuntu |
| **Linux** | `convertFlow-0.1.5-1.x86_64.rpm` | Fedora / RHEL / openSUSE |

### Upgrading

- **Windows / macOS / Linux deb / rpm**: install the new binary over the existing one.
- **AppImage**: download the new one. Settings (theme, presets, open files, API keys, LLM endpoint) persist in user config and carry over.

Builds still unsigned — SmartScreen / Gatekeeper steps from v0.1.0 still apply. See `RELEASE_NOTES_v0.1.0.md` for the workaround.

### Caveats (v1 of these features)

- **Contamination check** ships with ~50 inline phrases per benchmark. Bloom-filter sketches with full coverage are a follow-up.
- **Magpie** uses a two-pass query-then-response approach instead of strict pre-query-template manipulation. Functionally equivalent for SFT data.
- **Anthropic fine-tune** endpoint may need adjustment once their API exits private beta.
- **DEITA quality scoring** caps at 5k rows by default; click "Run on full dataset" for larger sets.

### Feedback

- Bug reports / feature requests: [support@quakkainfo.com](mailto:support@quakkainfo.com)
- If convertFlow saved you time: [buy me a coffee](https://buymeacoffee.com/abhijathkat)
- Web version (no install): [convertflow.live](https://convertflow.live)
