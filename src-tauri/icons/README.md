# App icons

Tauri expects icons in this folder before `tauri build` will succeed.

## Quick way: let Tauri generate them

If you have a high-resolution PNG (1024x1024 recommended), run:

```bash
npx @tauri-apps/cli icon path/to/your-logo.png
```

This generates every size + the `.icns` (macOS) and `.ico` (Windows) variants in one shot.

## Required files

After running the command above, you should have:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `Square30x30Logo.png`, `Square89x89Logo.png`, etc. (Windows Store, optional)

## Source idea

`public/favicon.svg` already exists — convert it to PNG@1024 first (Figma, Inkscape, or `npx svg2img-cli favicon.svg --width 1024 --output logo-1024.png`), then run the Tauri icon command on the PNG.
