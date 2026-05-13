// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import monacoEditorPluginRaw from 'vite-plugin-monaco-editor';

const monacoEditorPlugin = /** @type {any} */ (monacoEditorPluginRaw).default ?? monacoEditorPluginRaw;

export default defineConfig({
  site: 'https://convertflow.live',
  integrations: [svelte()],
  output: 'static',
  vite: {
    plugins: [
      tailwindcss(),
      monacoEditorPlugin({
        languageWorkers: ['editorWorkerService', 'json'],
      }),
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
