# convertFlow desktop app (Tauri)

Wraps the existing Astro + Svelte web app in a native window using [Tauri 2](https://tauri.app/).
Same codebase ships as a web app **and** as Windows / macOS / Linux installers.

## One-time setup

You need the Rust toolchain installed (Tauri compiles a small Rust shim around the web app).

### macOS / Linux
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Windows
Download and run `rustup-init.exe` from <https://rustup.rs>.

### Linux extra (Ubuntu / Debian)
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

That's the only one-time step. Everything else runs via the npm scripts in `package.json`.

## Generate icons (first time only)

The `icons/icon-source.svg` is the master design. Convert it to all required formats:

```bash
# From the repo root
npm run tauri:icon src-tauri/icons/icon-source.svg
```

This generates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` (macOS), `icon.ico` (Windows), and Microsoft Store tiles in `src-tauri/icons/`. They are `.gitignore`d — each contributor regenerates them locally.

If `tauri icon` can't read the SVG directly, first export it to a 1024×1024 PNG with any tool (Figma, Inkscape, ImageMagick: `convert -background none -resize 1024x1024 src-tauri/icons/icon-source.svg /tmp/icon-1024.png`) and run `npm run tauri:icon /tmp/icon-1024.png`.

## Develop

```bash
npm run tauri:dev
```

Spawns the Astro dev server on `:4321` and opens it inside a native Tauri window with hot reload. Same DX as `npm run dev` plus you can test desktop-only behaviour.

## Build installers

```bash
npm run tauri:build
```

Outputs to `src-tauri/target/release/bundle/`:

| Platform | File | Notes |
|---|---|---|
| macOS | `dmg/convertFlow_0.1.0_aarch64.dmg` + `macos/convertFlow.app` | Universal binary if built on Apple Silicon with `--target universal-apple-darwin` |
| Windows | `msi/convertFlow_0.1.0_x64_en-US.msi` + `nsis/convertFlow_0.1.0_x64-setup.exe` | Two installer flavours; ship the one you prefer |
| Linux | `deb/convertflow_0.1.0_amd64.deb` + `appimage/convertflow_0.1.0_amd64.AppImage` | `.deb` for Ubuntu/Debian; `.AppImage` runs anywhere |

`tauri build` only builds for the host platform. To produce installers for all three OSes, set up GitHub Actions (see [Tauri's official action](https://github.com/tauri-apps/tauri-action)).

## Code signing (recommended before public release)

Unsigned installers trigger SmartScreen (Windows) / Gatekeeper (macOS) warnings.

- **Windows**: Buy an OV or EV code-signing cert (~$300–500/year). Configure via `tauri.conf.json → bundle.windows.certificateThumbprint` or via the `WINDOWS_CERTIFICATE` env var in CI.
- **macOS**: Enroll in Apple Developer Program ($99/year), then notarize via `xcrun notarytool`. Configure via `tauri.conf.json → bundle.macOS.signingIdentity` + `APPLE_ID` / `APPLE_PASSWORD` env vars.
- **Linux**: No signing required, but you can self-sign `.deb` packages if you publish to a custom repo.

## How this integrates with the rest of the repo

- `frontendDist = "../dist"` — Tauri uses the same Astro static build that ships to Cloudflare Pages.
- `beforeBuildCommand = "npm run build"` — `tauri build` runs `astro build` first, no manual step.
- CSP in `tauri.conf.json → app.security.csp` mirrors `public/_headers` so OCR / PDF / Hugging Face calls all work in the desktop app too.
- The desktop window has its own opt-in capabilities (see `capabilities/default.json`). Currently only `core:default` (window, app) and `opener:default` (open URLs in the user's default browser) are granted.

## Future extensions

Once the basic build is working, look at:

- **Native file system access** — replace browser-only upload/download with native dialogs (read 500MB JSONLs without the upload dance) using `tauri-plugin-fs`.
- **Auto-updater** — `tauri-plugin-updater` checks a `latest.json` on the server and prompts the user.
- **System tray + menu bar** — `tauri-plugin-tray` for quick access without focusing the window.
- **Bundle the CDN assets** — currently pdf.js / tesseract.js still pull from CDN. For true offline use, vendor them into `dist/` and update the CSP to drop the remote sources.
