// CodeMirror syntax highlighting themes — token colors only, no background override.
// Background/chrome stays driven by EditorIsland's CSS-variable dataprepTheme.

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import type { ThemeId } from './monaco-theme';

// Token palettes that mirror THEME_DATA rules from monaco-theme.ts
const PALETTES: Record<ThemeId, { keyword: string; string: string; number: string; comment: string; key: string }> = {
  'dataprep-dark':    { keyword: '#7ab0d8', string: '#c5a46c', number: '#b08fe8', comment: '#6b6558', key: '#7ab0d8' },
  'dataprep-light':   { keyword: '#1c5a8a', string: '#8a5a10', number: '#5e37a1', comment: '#8a8a8a', key: '#1c5a8a' },
  'dracula':          { keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', comment: '#6272a4', key: '#8be9fd' },
  'monokai':          { keyword: '#f92672', string: '#e6db74', number: '#ae81ff', comment: '#75715e', key: '#a6e22e' },
  'one-dark':         { keyword: '#c678dd', string: '#98c379', number: '#d19a66', comment: '#5c6370', key: '#e06c75' },
  'tokyo-night':      { keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', comment: '#565f89', key: '#7aa2f7' },
  'nord':             { keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', comment: '#4c566a', key: '#88c0d0' },
  'solarized-dark':   { keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#586e75', key: '#268bd2' },
  'solarized-light':  { keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#93a1a1', key: '#268bd2' },
  'tomorrow-night':   { keyword: '#cc6666', string: '#b5bd68', number: '#de935f', comment: '#969896', key: '#81a2be' },
  'github-dark':      { keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', comment: '#8b949e', key: '#79c0ff' },
  'github-light':     { keyword: '#cf222e', string: '#0a3069', number: '#0550ae', comment: '#6e7781', key: '#0550ae' },
};

function buildHighlight(p: (typeof PALETTES)[ThemeId]): Extension {
  const hs = HighlightStyle.define([
    { tag: tags.keyword,               color: p.keyword },
    { tag: tags.operator,              color: p.keyword },
    { tag: tags.string,                color: p.string },
    { tag: tags.number,                color: p.number },
    { tag: tags.bool,                  color: p.number },
    { tag: tags.null,                  color: p.number },
    { tag: tags.comment,               color: p.comment, fontStyle: 'italic' },
    { tag: tags.lineComment,           color: p.comment, fontStyle: 'italic' },
    { tag: tags.blockComment,          color: p.comment, fontStyle: 'italic' },
    { tag: tags.propertyName,          color: p.key },
    { tag: tags.attributeName,         color: p.key },
    { tag: tags.heading,               color: p.keyword, fontStyle: 'bold' },
    { tag: tags.strong,                fontStyle: 'bold' },
    { tag: tags.emphasis,              fontStyle: 'italic' },
    { tag: tags.link,                  color: p.string, textDecoration: 'underline' },
    { tag: tags.monospace,             color: p.number },
    { tag: tags.punctuation,           color: 'var(--ink-dim)' },
    { tag: tags.bracket,               color: 'var(--ink-dim)' },
    { tag: tags.separator,             color: 'var(--ink-dim)' },
  ]);
  return syntaxHighlighting(hs);
}

// Cache built extensions so we don't rebuild on every re-render
const cache = new Map<ThemeId, Extension>();

export function getCodeMirrorTheme(id: ThemeId): Extension {
  if (!cache.has(id)) {
    cache.set(id, buildHighlight(PALETTES[id]));
  }
  return cache.get(id)!;
}
