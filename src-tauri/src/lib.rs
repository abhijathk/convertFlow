// convertFlow Tauri entrypoint.
// The frontend (Astro + Svelte) is served from the bundled dist/ folder.
// This crate just wraps it with a native window and exposes the
// `tauri-plugin-opener` so links can be opened in the user's default browser.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running convertFlow");
}
