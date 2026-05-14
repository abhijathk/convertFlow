## convertFlow Desktop — v0.1.1

Patch release focused on desktop-app polish and bug fixes. Same feature set as v0.1.0 — no new dataset/chunking functionality. If you're on v0.1.0 and the editor was blank or the Support button didn't work, this fixes both.

### What's fixed

- **Convert and Chunk editors are no longer blank in the desktop app.** The previous build's Content-Security-Policy didn't include the `tauri://localhost` / `ipc://localhost` origins that Tauri 2 uses for its internal protocol, so Monaco's web workers and IPC calls were silently blocked. CSP now allows those origins across `script-src`, `connect-src`, and `worker-src`.
- **Support button works.** Previously a no-op in the desktop window (because `target="_blank"` is blocked in Tauri webviews). Now uses the Tauri opener plugin to open the support page in your system browser.
- **Theme is reliably dark on first launch.** `prefers-color-scheme` is unreliable in webkit2gtk (Linux always returns false) and inconsistent in macOS WKWebView. The desktop app now defaults to dark when system detection is requested.
- **In-app update check** now talks to `https://convertflow.live/latest.json` correctly (the CSP previously blocked it).

### What's new

- **Support section in Settings.** Settings popover (gear icon) has a new "support" section with Buy Me a Coffee, sponsor-a-feature (mailto), report-a-bug (mailto), and a "Visit support page" link that opens in your system browser.
- **Cleaner top bar in the desktop app.** The Download and Help links (and the keyboard `?` shortcut) are now hidden inside the desktop window — they're for web visitors only. The theme toggle in the top bar was removed; switch theme from Settings → appearance.

### Downloads

| Platform | File | Notes |
|---|---|---|
| **Windows** | `convertFlow_0.1.1_x64-setup.exe` | NSIS installer — recommended |
| **Windows** | `convertFlow_0.1.1_x64_en-US.msi` | MSI installer — silent / managed installs |
| **macOS** | `convertFlow_0.1.1_universal.dmg` | Universal — Apple Silicon + Intel |
| **Linux** | `convertFlow_0.1.1_amd64.AppImage` | Universal — `chmod +x` and run |
| **Linux** | `convertFlow_0.1.1_amd64.deb` | Debian / Ubuntu |
| **Linux** | `convertFlow-0.1.1-1.x86_64.rpm` | Fedora / RHEL / openSUSE |

### Upgrading

- **Windows:** run the new installer over the existing one — it'll replace v0.1.0 in place.
- **macOS:** drag the new `convertFlow.app` over the existing one in Applications.
- **Linux deb:** `sudo dpkg -i convertFlow_0.1.1_amd64.deb`
- **Linux rpm:** `sudo rpm -U convertFlow-0.1.1-1.x86_64.rpm`
- **AppImage:** download the new one. Settings (theme, presets, open files) live in your user config and carry over.

Builds are still unsigned — the same SmartScreen / Gatekeeper steps from v0.1.0 apply.

### Feedback

- Bug reports / feature requests: [support@quakkainfo.com](mailto:support@quakkainfo.com)
- If convertFlow saved you time: [buy me a coffee](https://buymeacoffee.com/abhijathkat)
- Web version (no install required): [convertflow.live](https://convertflow.live)
