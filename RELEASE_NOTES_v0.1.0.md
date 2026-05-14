## convertFlow Desktop — v0.1.0

First public desktop build. Same in-browser app, wrapped in a native window so it runs without a browser tab and works fully offline.

### Why a desktop build?

convertFlow is privacy-first — everything (dataset prep, chunking, embeddings, PII redaction) runs locally in your own process. The desktop build doubles down on that:

- No browser tabs to lose, no autosave conflicts with other sites
- Works fully offline once installed
- Native window controls, sized for prep work
- Same codebase as [convertflow.live](https://convertflow.live) — nothing extra phones home

### Downloads

Pick the build for your platform:

| Platform | File | Size | Notes |
|---|---|---|---|
| **Windows** | `convertFlow_0.1.0_x64-setup.exe` | 8.51 MB | NSIS installer — recommended for most users |
| **Windows** | `convertFlow_0.1.0_x64_en-US.msi` | 9.44 MB | MSI installer — for org-managed / silent installs |
| **macOS** | `convertFlow_0.1.0_universal.dmg` | 19 MB | Universal binary — runs on Apple Silicon and Intel |
| **Linux** | `convertFlow_0.1.0_amd64.AppImage` | 81.5 MB | Universal — `chmod +x` and run, no install needed |
| **Linux** | `convertFlow_0.1.0_amd64.deb` | 10.5 MB | `sudo dpkg -i convertFlow_0.1.0_amd64.deb` for Debian/Ubuntu |
| **Linux** | `convertFlow-0.1.0-1.x86_64.rpm` | 10.5 MB | `sudo rpm -i convertFlow-0.1.0-1.x86_64.rpm` for Fedora/RHEL/openSUSE |

### Install notes

**Windows.** This build is **unsigned** (code-signing certs cost ~$300–500/year). You will see a SmartScreen warning the first time you run it — click **More info → Run anyway**. The MSI is provided for silent / managed installs (`msiexec /i convertFlow_0.1.0_x64_en-US.msi /quiet`).

**macOS.** This build is **unsigned and unnotarised** (Apple Developer cert is $99/year). On first launch macOS will say "convertFlow can't be opened because Apple cannot check it for malicious software." To run anyway:

1. Right-click `convertFlow.app` in Applications → **Open**
2. Click **Open** in the dialog
3. After the first launch, double-click works normally

Or from Terminal: `xattr -dr com.apple.quarantine /Applications/convertFlow.app`

The DMG is a single universal binary — it runs natively on Apple Silicon (M1/M2/M3/M4) and Intel Macs.

**Linux.**

- **AppImage** (any distro): `chmod +x convertFlow_0.1.0_amd64.AppImage && ./convertFlow_0.1.0_amd64.AppImage`
- **Debian / Ubuntu**: `sudo dpkg -i convertFlow_0.1.0_amd64.deb` (Ubuntu 22.04+ / Debian 12+)
- **Fedora / RHEL / openSUSE**: `sudo rpm -i convertFlow-0.1.0-1.x86_64.rpm`
- Requires `libwebkit2gtk-4.1` (most modern distros have this). On Ubuntu: `sudo apt install libwebkit2gtk-4.1-0`. On Fedora: `sudo dnf install webkit2gtk4.1`.
- AppImage may need `libfuse2`: `sudo apt install libfuse2`.

### What's in this release

**Convert tab** — JSONL dataset prep for LLM fine-tuning

- 20+ format presets (OpenAI, Anthropic, Mistral, Llama, Gemma, Qwen, DeepSeek, Cohere, Together AI, plain Alpaca/Vicuna, more)
- Real-time validation against each preset's schema
- Dataset statistics panel: role balance, token-length distribution, refusal detection, duplicate detection, content quality flags, cost estimates
- Multi-system-prompt support (round-robin / random rotation for prompt-style ablations)
- Preset auto-lock + prep auto-lock (set-and-forget defaults)

**Chunk tab** — RAG document chunking

- PDF text extraction (in-browser pdfjs-dist)
- Image extraction + OCR (tesseract.js)
- Configurable chunk size + overlap
- Chunk statistics: density, size variance, coverage, overlap waste
- Export to JSONL / Parquet

**Utilities**

- PII redactor (regex + entropy-based secret detection)
- Token counter
- Format converter (CSV ↔ JSONL ↔ Parquet)
- Diff viewer

**Editor**

- Monaco editor with JSONL syntax highlighting
- Split-pane preview
- Jump-to-line from stats panels

### What's *not* in this release

- **Auto-updates** — you'll need to grab future releases from GitHub manually. Auto-update wiring is in the codebase but disabled for v0.1.0 until I have a signing cert.
- **Code signing** — unsigned on Windows and macOS. See install notes above.
- **System tray** — the app runs as a regular window only. Minimize-to-tray is planned.

### Known issues

- First launch on macOS Gatekeeper requires the right-click-Open workaround (see above).
- Linux builds require `libwebkit2gtk-4.1` — older distros (Ubuntu 20.04, Debian 11, CentOS 8) won't work; please use the web version at [convertflow.live](https://convertflow.live).
- Very large datasets (>500 MB) may be slow in the editor — use the web version with streaming for now.

### Verify your download

SHA-256 checksums:

```
1133a9c533c82d330d889c43b236e3d25b8514791eb886be0e948c1a6f7d31f2  convertFlow-0.1.0-1.x86_64.rpm
bceebbe927540b197d76bc5ce8c7ba584e0f92f11379171689ea0970b44a21d1  convertFlow_0.1.0_amd64.AppImage
032f84535c0e4b41cbcc4b6a0d66c6a99512f4c689b70c4cfd54aff1f64bb242  convertFlow_0.1.0_amd64.deb
45be3de1a8cb97ee34a5fdbb469acb5f5cdd48d101a11270e9402787e7bd8b8b  convertFlow_0.1.0_universal.dmg
6ce3a918aa56fa8f2dcd9b50838f3c56faf163e93e0658a72bfa3d4a7cd064ef  convertFlow_0.1.0_x64-setup.exe
4beddcab7f7e5c31261059b66cc8f4a0aa1d88a768db244decc8a6a026c80231  convertFlow_0.1.0_x64_en-US.msi
fb5475272277d683698fcd54a8a47bed4beb235f8f8b9e799cc76b778a727cd7  convertFlow_universal.app.tar.gz
```

Verify with:

```sh
# macOS / Linux
shasum -a 256 convertFlow_0.1.0_universal.dmg

# Windows (PowerShell)
Get-FileHash convertFlow_0.1.0_x64-setup.exe -Algorithm SHA256
```

The hash you compute should match the one above.

### Feedback

- Bug reports / feature requests: [support@quakkainfo.com](mailto:support@quakkainfo.com) or open an issue on this repo
- If convertFlow saved you time: [buy me a coffee](https://buymeacoffee.com/abhijathkat)
- Web version (no install required): [convertflow.live](https://convertflow.live)

---

**Full source:** [convertflow.live](https://convertflow.live) · MIT licensed · no telemetry, no accounts, no upsell.
