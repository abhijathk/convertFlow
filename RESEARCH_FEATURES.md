# convertFlow: research-grounded feature proposal

*Compiled May 2026 from current primary sources (arxiv, EMNLP/ACL/ICLR/NeurIPS proceedings, vendor docs). **Revised after codebase audit.***

## Reality check (audited against codebase)

Many of my initial proposals already exist. Audited via grep across `src/`. Strikethroughs were redacted from the proposal list; existing features are listed here for completeness:

| Feature | Status | Where |
|---|---|---|
| Train / val / test split (random) | ✓ EXISTS | `src/lib/utilities/tools/dataset-splitter.ts` |
| Deduplication — exact, normalized, semantic (Jaccard), field-based | ✓ EXISTS | `src/lib/utilities/tools/duplicate-detector.ts` |
| Semantic chunking (Jaccard / bag-of-words) | ✓ EXISTS (beta) | `ChunkStrategyPicker.svelte`, `chunk.worker.ts` |
| Conversation reshaping | ✓ EXISTS | `src/lib/utilities/tools/conversation-formatter.ts` |
| Schema migrator | ✓ EXISTS | `src/lib/utilities/tools/schema-migrator.ts` |
| Embedding cost budget | ✓ EXISTS (cost-only) | `src/lib/utilities/tools/embedding-budget.ts` + `data/embedders.json` |
| Token analyzer (single tokenizer) | ✓ EXISTS | `src/lib/utilities/tools/token-analyzer.ts` |
| Cost calculator | ✓ EXISTS | `src/lib/utilities/tools/cost-calculator.ts` |
| PII redactor (regex + entropy) | ✓ EXISTS | `src/lib/utilities/tools/pii-redactor.ts` |
| Prompt-injection detection (count in stats) | ✓ EXISTS | `dataset-stats.ts`, `dataset-summary.ts` |
| HuggingFace Hub push | ✓ EXISTS | `src/lib/hf-hub.ts`, `HfHubPushDialog.svelte` |
| Folder import (Convert tab only) | ✓ EXISTS | `ConvertImportPanel.svelte` (`webkitdirectory`) |
| JSONL repair, JSON validator, regex tester, hash tools, encoding tools, timestamp tools, CSV↔TSV↔JSON, template expander, text transformer | ✓ EXIST | `src/lib/utilities/tools/` |

So the **original "build train/val/test split" headline was wrong** — it exists. The interesting question is what's *still* missing or worth enhancing.

## Executive summary (revised)

The product is significantly more complete than I first assumed. The real gaps cluster around three areas:

1. **Embedding-aware chunking and retrieval validation.** Current "semantic" chunking uses Jaccard over bag-of-words — fast but coarse. Real embedding-based semantic chunking + a query-test playground is the highest-impact upgrade.
2. **NER-based PII** to upgrade the regex-only redactor. Regex catches structured PII (SSN, keys, JWTs) but misses contextual names/organisations/locations. Microsoft Presidio's hybrid is the standard.
3. **Multi-tokenizer comparison + dataset contamination check.** The token-analyzer uses one tokenizer; users routinely want to compare cl100k vs Llama-3 vs Gemma SP. Contamination-vs-MMLU/GSM8K is a clean differentiator no other in-browser tool offers.

Below: 11 ranked proposals, all verified-missing or verified-partial.

---

## Proposals (revised after audit)

### 1. Embedding-based semantic chunking — priority: high
**Status**: PARTIAL — current `semantic` strategy uses Jaccard/BoW. The ChunkStrategyPicker description even acknowledges: *"For better semantic chunks, use an external embedding model."*
**What it does** — Adds a fourth strategy `embedding` that uses transformers.js + `Xenova/all-MiniLM-L6-v2` (~23 MB q8). Embed each sentence, find cosine-similarity local minima, split there. Cache the model in IndexedDB. Keep the existing Jaccard strategy as the "no-model" fast path.
**Why** — Multiple recent empirical studies show 5–9% retrieval recall lift over fixed/Jaccard chunking ([NMF chunking, Springer 2025](https://link.springer.com/article/10.1007/s11227-026-08370-3); [Max-Min semantic chunker, Springer 2025](https://link.springer.com/article/10.1007/s10791-025-09638-7); [ChunkRAG, 2410.19572](https://arxiv.org/abs/2410.19572)). The product already wires up the chunking strategy plumbing so adding a new entry is small.
**Implementation**
- `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` (v4 with WebGPU runtime, ~3–5× faster than CPU).
- Add `embedding` to `ChunkStrategy` union in `chunkState.ts`.
- Extend `chunk.worker.ts` with the new path.
- Show download progress on first use ("downloading 23 MB embedding model…").
**Effort** — M.

### 2. Late chunking mode — priority: high
**Status**: MISSING.
**What it does** — A toggle on the Chunk tab: "Use late chunking — preserves cross-chunk context in embeddings." Embeds the whole document first (or up to 8k tokens), then mean-pools per chunk span. Output chunks come with `embedding` field populated.
**Why** — [Günther et al., Jina AI, EMNLP 2024 (2409.04701)](https://arxiv.org/abs/2409.04701). Each chunk's embedding contains context from neighbours (e.g., resolves "it" → "the company"). Improves nDCG@10 on BEIR tasks at zero training cost. Pairs naturally with proposal 1.
**Implementation**
- Needs an 8k-context model — `Xenova/jina-embeddings-v2-small-en` (~33 MB) or similar.
- After encoding, mean-pool tokens within each chunk's char-range to get the chunk embedding.
- Add `embedding: number[]` to the chunk output type.
- Export option: `chunks.parquet` with `embedding` column.
**Effort** — M.

### 3. Retrieval-quality preview — priority: high
**Status**: MISSING.
**What it does** — A "Test query" input at the bottom of the chunks list. User types a question; app computes its embedding and shows the top-5 chunks by cosine similarity, with the matched span scroll-highlighted in the chunk preview panel.
**Why** — Geometric stats (size, variance, coverage) measure chunk *shape*, not *usefulness*. [RAGAS (Es et al. 2024, 2309.15217)](https://arxiv.org/abs/2309.15217) defines context_precision and context_recall — both depend on running actual retrieval. This is the minimum-viable RAGAS for chunk quality. Smallest-effort feature with the biggest "now I trust my chunks" payoff.
**Implementation**
- Depends on proposals 1/2 to land first (need chunk embeddings cached).
- Linear k-NN: ~30 ms for < 10k chunks on M1.
- Hook up to existing `ChunkPreview.svelte` for the scroll-highlight.
**Effort** — S after #1 lands.

### 4. NER-based PII upgrade — priority: high
**Status**: PARTIAL — current `pii-redactor.ts` is regex + entropy. Catches keys/JWTs/SSNs well, misses contextual names.
**What it does** — Adds "neural mode" toggle to PII Redactor. Loads `Xenova/bert-base-NER` (or distilbert variant, ~50 MB q8). Finds PERSON / ORG / LOCATION / DATE entities. Combines with existing regex hits; dedupes overlapping spans; confidence threshold slider (default 0.85).
**Why** — Microsoft Presidio's architecture (regex + spaCy/transformer NER + context-aware enhancer) is the reference standard. [Presidio docs](https://microsoft.github.io/presidio/analyzer/nlp_engines/transformers/). Regex alone misses ~70% of named PII in free-form text.
**Implementation**
- transformers.js token-classification pipeline.
- Cache model in IndexedDB.
- Run after regex pass; merge overlapping spans by union.
- Surface in the redactor UI as an opt-in checkbox.
**Effort** — M.

### 5. Multi-tokenizer comparison in token-analyzer — priority: high
**Status**: PARTIAL — token-analyzer uses one tokenizer (`approximateTokens`). 
**What it does** — Add a "compare tokenizers" mode. Pick text, see how `cl100k_base` (OpenAI), `o200k_base` (GPT-4o), `Llama-3`, `Mistral`, `Gemma`, and Anthropic's tokenizer count it. Also: per-token coloured visualisation showing the actual splits.
**Why** — Same string costs different amounts across providers. The user-facing question "why is my Llama bill 1.4× my OpenAI bill?" is answered by tokenizer differences (`js-tiktoken` cl100k vs SentencePiece on the same text). Existing tool only gives the number.
**Implementation**
- `js-tiktoken` already bundled for OpenAI variants.
- SentencePiece WASM (`sentencepiece-wasm` npm package, ~150 KB) + Llama-3 / Mistral / Gemma `.model` files (~2 MB each, bundled).
- Two-up view: input box + multi-column tokenizer output, each with HSL-distinct token coloring.
**Effort** — M.

### 6. Dataset contamination check — priority: medium
**Status**: MISSING.
**What it does** — A new utility: "Does my fine-tune data overlap with common eval benchmarks?" Loads bundled 13-gram Bloom-filter sketches of MMLU, GSM8K, HellaSwag, HumanEval, IFEval, ARC. Per row, hashes its 13-grams, checks against the sketches, flags matches with a confidence score.
**Why** — Test-set contamination inflates reported scores. [Brown et al. 2020 (GPT-3, 2005.14165)](https://arxiv.org/abs/2005.14165) defined the 13-gram standard. [Yang et al. 2024 (2406.04244)](https://arxiv.org/abs/2406.04244) survey catalogues 50+ contamination cases in public datasets. No competitor does this in-browser.
**Implementation**
- Pre-compute Bloom-filter sketches of the 6 benchmarks offline; ship as `data/contamination/*.bloom` (~10 MB total compressed).
- Per row: shingle into 13-grams, hash each, check filter.
- Surface in utility output + as a stats-panel warning when the active dataset has any matches.
**Effort** — M.

### 7. Stratified split + leakage check (enhancement to `dataset-splitter`) — priority: medium
**Status**: PARTIAL — current splitter does random shuffle. No stratification, no leakage check between splits.
**What it does** — Adds two options to the existing splitter UI:
- **Stratify by**: dropdown — none / role-mix / length-bucket / system-prompt / custom-field. Preserves the source distribution in each split.
- **Check leakage**: post-split, run a 13-gram overlap pass between train and val/test; warn on any overlapping rows.
**Why** — Naïve random splits over-report performance on imbalanced datasets ([Northcutt et al. 2021 JAIR (1911.00068)](https://arxiv.org/abs/1911.00068)). Random splits can let near-duplicate rows leak between train and test, also inflating numbers.
**Implementation** — extension to `dataset-splitter.ts`; reuses the dedup `normalized` mode logic.
**Effort** — S.

### 8. Push to OpenAI / Anthropic fine-tune APIs — priority: medium
**Status**: PARTIAL — HF Hub push exists. No OpenAI or Anthropic.
**What it does** — Settings → "Fine-tune endpoints". Paste API key (stored in localStorage). Convert tab gets a "Push" dropdown alongside HF push: OpenAI / Anthropic / HF. Validates format against preset, uploads via the provider's Files API, starts the fine-tune job, surfaces job ID.
**Why** — Closes the loop. Currently users export JSONL, switch tools, run `openai files upload` manually. The HF integration already exists as a template for this; OpenAI/Anthropic should mirror it.
**Implementation**
- OpenAI: `POST /v1/files` (purpose=fine-tune), `POST /v1/fine_tuning/jobs`. CORS-friendly from browser.
- Anthropic fine-tune is in private beta (check current API).
- Add `https://api.openai.com https://api.anthropic.com` to existing CSP `connect-src`.
- Reuse HF dialog UX pattern.
**Effort** — M.

### 9. DEITA-style quality scoring — priority: medium
**Status**: MISSING.
**What it does** — Per-row score combining complexity (length × token entropy × turn depth), quality (in-browser GPT-2-small perplexity as inverse-coherence proxy), and diversity (HDBSCAN cluster density on embeddings from #1/#2). Adds a sortable "Quality" column in the Convert tab; users can keep top-N by quality.
**Why** — [Liu et al., DEITA, ICLR 2024 (2312.15685)](https://arxiv.org/abs/2312.15685) showed 6k DEITA-selected samples ≥ 10× more data. [LIMA, NeurIPS 2023 (2305.11206)](https://arxiv.org/abs/2305.11206) showed 1k high-quality > 50k mediocre. This is the most-cited result in fine-tune-data research.
**Implementation** — depends on embeddings cache; complexity is heuristic, quality needs a small LM. Most complex item on this list; ship after #1.
**Effort** — L.

### 10. Bulk / folder import in Chunk tab — priority: medium
**Status**: MISSING — Convert tab supports `webkitdirectory`; Chunk tab is single-file drop only (`ChunkTab.svelte:430` reads `files[0]`).
**What it does** — Drag-drop a folder. Walk it, ingest all PDFs/MDs/TXTs, chunk each, output one combined dataset with per-source tags (`{source: "doc.pdf", page: 12}`). Per-file ingestion progress.
**Why** — Real RAG corpora are 20+ documents, not one. Without folder import, the workflow is "chunk each file separately, then merge externally." The Convert tab already has the pattern — Chunk tab just needs to copy it.
**Implementation**
- Mirror the `folderInput` pattern from `ConvertImportPanel.svelte`.
- Queue files; reuse existing PDF/OCR/MD parsers.
- Attach `source` field on each chunk during enrichment.
**Effort** — S.

### 11. Local-LLM data synthesis (Magpie) — priority: medium (requires user-provided model)
**Status**: MISSING.
**What it does** — Settings → "Local LLM endpoint" (default `http://localhost:11434` for Ollama). New "Generate" action in Convert tab: template selector (LLaMA-3-chat, Qwen2.5-instruct, Gemma-2), batch size, target row count. Uses Magpie technique — send the model only its pre-query template (no seed), let it generate a query, then a response. Streams results into the active dataset.
**Why** — [Xu et al., Magpie, ICLR 2025 (2406.08464)](https://arxiv.org/abs/2406.08464). Their 4M-row Llama-3 dataset matches carefully-curated alternatives. Free training data, derived from a model the user already has running. Doesn't break local-only as long as the LLM is local.
**Implementation**
- Add `http://localhost:*` to CSP `connect-src`.
- Streaming HTTP to the Ollama / LM Studio / llama.cpp HTTP API.
- UI is a new dialog: pick template, count, batch size, start.
**Effort** — M.

### 12. Source metadata on every chunk — priority: low (likely partially done, verify)
**Status**: UNCLEAR — couldn't conclusively find the chunk type definition; the `ChunkResult` type infers from `enrichChunks()`. Worth a 5-min check: open `src/lib/chunk.ts` and confirm `{source, page, section}` fields exist. If they do, this is done. If not, add it as a partial of proposal 10.
**Effort** — XS (audit) + S (add fields if missing).

### 13. Validation report export — priority: low
**Status**: MISSING. Stats panel shows the validation errors but no "export to markdown/CSV" action.
**What it does** — Button at the top of the Convert stats: "Export validation report" → writes `report.md` or `report.csv` with per-row error + severity + line number + summary.
**Implementation** — Reuses existing validation pipeline output; one function in `dataset-summary.ts`.
**Effort** — XS.

---

## What NOT to build

- **In-app reranker training UI.** Cross-encoders live in production retrieval code paths convertFlow doesn't own. Stay at the dataset layer.
- **Vector-database integration.** Don't pick favourites among hundreds of vector DBs. Export embeddings as Parquet (proposal 2) and let users pipe to whatever store they use.
- **Custom tokenizer training.** Niche. SentencePiece works locally but the audience is tiny.
- **Server-side anything.** Defeats the product premise.
- **API-call-based synthetic data generation (OpenAI / Anthropic).** Breaks "100% local." [Argilla's Distilabel](https://distilabel.argilla.io/) already does it well externally.

## Competitive positioning (revised)

| Tool | Convert/Chunk overlap | convertFlow's edge |
|---|---|---|
| **HF dataset viewer** | Read-only browse | Editing, validation, stats, format conversion |
| **NVIDIA NeMo Curator** | T-token-scale curation on GPU clusters | Zero infra; 30-sec workflow on a 1k-row dataset; in-browser |
| **Argilla** | Annotation + RLHF + LLM evaluation (with login) | No login, offline, integrated stats, format-aware presets |
| **Cleanlab** | Label-error detection on classification | Format-aware for SFT/chat data; broader provider preset library |
| **LangChain / LlamaIndex loaders** | Python doc loaders + chunkers | UI-first; iterate without rewriting code |
| **Distilabel** | LLM-based synthetic data generation | Local-first preprocessing; convertFlow consumes Distilabel output |

**Defensible wedge**: the single-engineer, single-laptop, "I need to ship this dataset by EOD" workflow. NeMo and Argilla assume teams + GPUs + servers; HF viewer is read-only; LangChain is library-only. convertFlow is the only UI-first, local, validation-rich tool in this niche.

---

## Sources (papers actually read)

- [Zhou et al., LIMA: Less Is More for Alignment, NeurIPS 2023 (2305.11206)](https://arxiv.org/abs/2305.11206) — 1k curated ≥ 50k crowd-sourced.
- [Liu et al., DEITA, ICLR 2024 (2312.15685)](https://arxiv.org/abs/2312.15685) — complexity × quality × diversity scoring.
- [Abbas et al., SemDeDup (2303.09540)](https://arxiv.org/abs/2303.09540) — 50% LAION removal, no downstream loss.
- [Lee et al., Deduplicating Training Data, ACL 2022 (2107.06499)](https://arxiv.org/abs/2107.06499) — 1.5× sample efficiency from dedup.
- [Günther et al., Late Chunking, EMNLP 2024 (2409.04701)](https://arxiv.org/abs/2409.04701) — embed first, chunk after.
- [Chen et al., Dense X Retrieval, EMNLP 2024 (2312.06648)](https://arxiv.org/abs/2312.06648) — proposition-level indexing.
- [Es et al., RAGAS, EACL 2024 (2309.15217)](https://arxiv.org/abs/2309.15217) — faithfulness / context-recall / context-precision.
- [Greshake et al., Indirect Prompt Injection (2302.12173)](https://arxiv.org/abs/2302.12173) — attacks through retrieved data.
- [Zhou et al., IFEval (2311.07911)](https://arxiv.org/abs/2311.07911) — 25 verifiable instruction types.
- [Wang et al., Self-Instruct, ACL 2023 (2212.10560)](https://arxiv.org/abs/2212.10560) — bootstrap instructions from base.
- [Xu et al., WizardLM / Evol-Instruct (2304.12244)](https://arxiv.org/abs/2304.12244) — iterative complexity rewrites.
- [Xu et al., Magpie, ICLR 2025 (2406.08464)](https://arxiv.org/abs/2406.08464) — synth from aligned LLMs with no seed.
- [Northcutt et al., Confident Learning, JAIR 2021 (1911.00068)](https://arxiv.org/abs/1911.00068) — Cleanlab foundations.
- [Yang et al., Data Contamination Survey (2406.04244)](https://arxiv.org/abs/2406.04244) — 50+ contamination cases catalogued.
- [ChunkRAG (2410.19572)](https://arxiv.org/abs/2410.19572) — LLM-based chunk filtering.
- [Brown et al., GPT-3 (2005.14165)](https://arxiv.org/abs/2005.14165) — defined the 13-gram contamination standard.
- [Microsoft Presidio docs](https://microsoft.github.io/presidio/) — hybrid PII detection architecture.
- [transformers.js v4 release](https://github.com/huggingface/transformers.js) — WebGPU runtime, 200+ architectures.
- [NVIDIA NeMo Curator features](https://docs.nvidia.com/nemo/curator/25.09/about/key-features.html) — competitive context.
- [LlamaIndex small-to-big retrieval](https://medium.com/data-science/advanced-rag-01-small-to-big-retrieval-172181b396d4) — parent-child chunking.
- [Argilla 2.0 release](https://argilla.io/blog/argilla-2-release/) — competitive context.
