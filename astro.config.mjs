// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// NOTE: vite-plugin-monaco-editor was removed. EditorTab.svelte already
// loads Monaco's workers via Vite's native `?worker` import syntax
// (search for "monaco-editor/esm/vs/.../worker?worker" in EditorTab),
// which produces worker chunks at build time without needing the plugin.
// The plugin also had a Windows path-joining bug that broke `tauri build`
// on windows-latest (it would mkdir a path like
// "D:\a\repo\repo\D:\a\repo\repo\dist\monacoeditorwork" and crash).

export default defineConfig({
  site: 'https://convertflow.live',
  integrations: [svelte()],
  output: 'static',
  vite: {
    plugins: [
      tailwindcss(),
    ],
    optimizeDeps: {
      exclude: ['pdfjs-dist', 'parquet-wasm'],
    },
    worker: {
      format: 'es',
    },
    build: {
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/js-tiktoken')) {
              return 'tiktoken';
            }
            if (id.includes('node_modules/@codemirror') || id.includes('node_modules/@lezer')) {
              return 'codemirror';
            }
            if (id.includes('node_modules/monaco-editor')) {
              return 'monaco';
            }
          },
        },
      },
    },
  },
});
