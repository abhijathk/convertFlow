// Monaco theme definitions: dataprep-dark, dataprep-light, plus 10 popular VS Code themes.
// Themes apply ONLY inside Monaco editor panes — shell stays dataprep-amber.
// See DESIGN.md for color tokens that dataprep-* themes mirror.

import type { editor } from 'monaco-editor';

export type ThemeId =
  | 'dataprep-dark'
  | 'dataprep-light'
  | 'dracula'
  | 'monokai'
  | 'one-dark'
  | 'tokyo-night'
  | 'nord'
  | 'solarized-dark'
  | 'solarized-light'
  | 'tomorrow-night'
  | 'github-dark'
  | 'github-light';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  base: 'vs-dark' | 'vs';
  swatch: string;
  mode: 'dark' | 'light';
}

export const THEMES: ThemeMeta[] = [
  { id: 'dataprep-dark',    label: 'dataprep dark (default)', base: 'vs-dark', swatch: '#e0a84e', mode: 'dark' },
  { id: 'dataprep-light',   label: 'dataprep light',          base: 'vs',      swatch: '#b5710f', mode: 'light' },
  // Dark-mode themes
  { id: 'dracula',          label: 'Dracula',                 base: 'vs-dark', swatch: '#bd93f9', mode: 'dark' },
  { id: 'monokai',          label: 'Monokai',                 base: 'vs-dark', swatch: '#f92672', mode: 'dark' },
  { id: 'one-dark',         label: 'One Dark',                base: 'vs-dark', swatch: '#61afef', mode: 'dark' },
  { id: 'tokyo-night',      label: 'Tokyo Night',             base: 'vs-dark', swatch: '#7aa2f7', mode: 'dark' },
  { id: 'nord',             label: 'Nord',                    base: 'vs-dark', swatch: '#88c0d0', mode: 'dark' },
  { id: 'solarized-dark',   label: 'Solarized Dark',          base: 'vs-dark', swatch: '#b58900', mode: 'dark' },
  { id: 'tomorrow-night',   label: 'Tomorrow Night',          base: 'vs-dark', swatch: '#cc6666', mode: 'dark' },
  { id: 'github-dark',      label: 'GitHub Dark',             base: 'vs-dark', swatch: '#58a6ff', mode: 'dark' },
  // Light-mode themes
  { id: 'solarized-light',  label: 'Solarized Light',         base: 'vs',      swatch: '#268bd2', mode: 'light' },
  { id: 'github-light',     label: 'GitHub Light',            base: 'vs',      swatch: '#0969da', mode: 'light' },
];

// Hex values mirror DESIGN.md tokens.
// dataprep-dark uses --bg/--surface/--ink/--ink-dim/--accent/--syntax-* from DESIGN.md (lines 50-66).
const DATAPREP_DARK: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '',                  foreground: 'e6e1d7', background: '0e1116' },
    { token: 'comment',           foreground: '6b6558', fontStyle: 'italic' },
    { token: 'keyword',           foreground: '7ab0d8' },
    { token: 'string',            foreground: 'c5a46c' },
    { token: 'string.key.json',   foreground: '7ab0d8' },
    { token: 'string.value.json', foreground: 'c5a46c' },
    { token: 'number',            foreground: 'b08fe8' },
    { token: 'delimiter',         foreground: 'a8a296' },
  ],
  colors: {
    'editor.background':                  '#0e1116',
    'editor.foreground':                  '#e6e1d7',
    'editor.lineHighlightBackground':     '#161a21',
    'editorCursor.foreground':            '#e0a84e',
    'editorLineNumber.foreground':        '#6b6558',
    'editorLineNumber.activeForeground':  '#a8a296',
    'editor.selectionBackground':         '#e0a84e33',
    'editor.inactiveSelectionBackground': '#e0a84e22',
    'editorWidget.background':            '#161a21',
    'editorWidget.border':                '#242933',
    'editorIndentGuide.background1':      '#242933',
    'editorBracketMatch.background':      '#e0a84e26',
    'editorBracketMatch.border':          '#e0a84e',
    'editorError.foreground':             '#e07575',
    'editorWarning.foreground':           '#d4a24a',
    'editorInfo.foreground':              '#7ab0d8',
  },
};

const DATAPREP_LIGHT: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '',                  foreground: '1a1d21', background: 'f6f5ef' },
    { token: 'comment',           foreground: '8a8a8a', fontStyle: 'italic' },
    { token: 'keyword',           foreground: '1c5a8a' },
    { token: 'string',            foreground: '8a5a10' },
    { token: 'string.key.json',   foreground: '1c5a8a' },
    { token: 'string.value.json', foreground: '8a5a10' },
    { token: 'number',            foreground: '5e37a1' },
    { token: 'delimiter',         foreground: '57606a' },
  ],
  colors: {
    'editor.background':                  '#f6f5ef',
    'editor.foreground':                  '#1a1d21',
    'editor.lineHighlightBackground':     '#ffffff',
    'editorCursor.foreground':            '#b5710f',
    'editorLineNumber.foreground':        '#8a8a8a',
    'editorLineNumber.activeForeground':  '#57606a',
    'editor.selectionBackground':         '#b5710f33',
    'editor.inactiveSelectionBackground': '#b5710f22',
    'editorWidget.background':            '#ffffff',
    'editorWidget.border':                '#e2dfd5',
    'editorBracketMatch.background':      '#b5710f26',
    'editorBracketMatch.border':          '#b5710f',
    'editorError.foreground':             '#b4261e',
    'editorWarning.foreground':           '#8a6d15',
    'editorInfo.foreground':              '#1c5a8a',
  },
};

// Popular VS Code themes (compact reproductions — keep core look, not pixel-perfect)
const DRACULA: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: 'f8f8f2', background: '282a36' },
    { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff79c6' },
    { token: 'string', foreground: 'f1fa8c' },
    { token: 'number', foreground: 'bd93f9' },
    { token: 'string.key.json', foreground: '8be9fd' },
  ],
  colors: { 'editor.background': '#282a36', 'editor.foreground': '#f8f8f2', 'editorCursor.foreground': '#bd93f9', 'editor.lineHighlightBackground': '#44475a', 'editorLineNumber.foreground': '#6272a4', 'editor.selectionBackground': '#44475a' },
};

const MONOKAI: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: 'f8f8f2', background: '272822' },
    { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'f92672' },
    { token: 'string', foreground: 'e6db74' },
    { token: 'number', foreground: 'ae81ff' },
    { token: 'string.key.json', foreground: 'a6e22e' },
  ],
  colors: { 'editor.background': '#272822', 'editor.foreground': '#f8f8f2', 'editorCursor.foreground': '#f8f8f0', 'editor.lineHighlightBackground': '#3e3d32', 'editorLineNumber.foreground': '#75715e' },
};

const ONE_DARK: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: 'abb2bf', background: '282c34' },
    { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c678dd' },
    { token: 'string', foreground: '98c379' },
    { token: 'number', foreground: 'd19a66' },
    { token: 'string.key.json', foreground: 'e06c75' },
  ],
  colors: { 'editor.background': '#282c34', 'editor.foreground': '#abb2bf', 'editorCursor.foreground': '#528bff', 'editor.lineHighlightBackground': '#2c313c', 'editorLineNumber.foreground': '#5c6370' },
};

const TOKYO_NIGHT: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: 'a9b1d6', background: '1a1b26' },
    { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'bb9af7' },
    { token: 'string', foreground: '9ece6a' },
    { token: 'number', foreground: 'ff9e64' },
    { token: 'string.key.json', foreground: '7aa2f7' },
  ],
  colors: { 'editor.background': '#1a1b26', 'editor.foreground': '#a9b1d6', 'editorCursor.foreground': '#c0caf5', 'editor.lineHighlightBackground': '#24283b', 'editorLineNumber.foreground': '#565f89' },
};

const NORD: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: 'd8dee9', background: '2e3440' },
    { token: 'comment', foreground: '4c566a', fontStyle: 'italic' },
    { token: 'keyword', foreground: '81a1c1' },
    { token: 'string', foreground: 'a3be8c' },
    { token: 'number', foreground: 'b48ead' },
    { token: 'string.key.json', foreground: '88c0d0' },
  ],
  colors: { 'editor.background': '#2e3440', 'editor.foreground': '#d8dee9', 'editorCursor.foreground': '#d8dee9', 'editor.lineHighlightBackground': '#3b4252', 'editorLineNumber.foreground': '#4c566a' },
};

const SOLARIZED_DARK: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: '839496', background: '002b36' },
    { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
    { token: 'keyword', foreground: '859900' },
    { token: 'string', foreground: '2aa198' },
    { token: 'number', foreground: 'd33682' },
    { token: 'string.key.json', foreground: '268bd2' },
  ],
  colors: { 'editor.background': '#002b36', 'editor.foreground': '#839496', 'editorCursor.foreground': '#b58900', 'editor.lineHighlightBackground': '#073642', 'editorLineNumber.foreground': '#586e75' },
};

const SOLARIZED_LIGHT: editor.IStandaloneThemeData = {
  base: 'vs', inherit: true,
  rules: [
    { token: '', foreground: '657b83', background: 'fdf6e3' },
    { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
    { token: 'keyword', foreground: '859900' },
    { token: 'string', foreground: '2aa198' },
    { token: 'number', foreground: 'd33682' },
    { token: 'string.key.json', foreground: '268bd2' },
  ],
  colors: { 'editor.background': '#fdf6e3', 'editor.foreground': '#657b83', 'editorCursor.foreground': '#b58900', 'editor.lineHighlightBackground': '#eee8d5', 'editorLineNumber.foreground': '#93a1a1' },
};

const TOMORROW_NIGHT: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: 'c5c8c6', background: '1d1f21' },
    { token: 'comment', foreground: '969896', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'cc6666' },
    { token: 'string', foreground: 'b5bd68' },
    { token: 'number', foreground: 'de935f' },
    { token: 'string.key.json', foreground: '81a2be' },
  ],
  colors: { 'editor.background': '#1d1f21', 'editor.foreground': '#c5c8c6', 'editorCursor.foreground': '#c5c8c6', 'editor.lineHighlightBackground': '#282a2e', 'editorLineNumber.foreground': '#969896' },
};

const GITHUB_DARK: editor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: '', foreground: 'c9d1d9', background: '0d1117' },
    { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff7b72' },
    { token: 'string', foreground: 'a5d6ff' },
    { token: 'number', foreground: '79c0ff' },
    { token: 'string.key.json', foreground: '79c0ff' },
  ],
  colors: { 'editor.background': '#0d1117', 'editor.foreground': '#c9d1d9', 'editorCursor.foreground': '#58a6ff', 'editor.lineHighlightBackground': '#161b22', 'editorLineNumber.foreground': '#8b949e' },
};

const GITHUB_LIGHT: editor.IStandaloneThemeData = {
  base: 'vs', inherit: true,
  rules: [
    { token: '', foreground: '24292f', background: 'ffffff' },
    { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'cf222e' },
    { token: 'string', foreground: '0a3069' },
    { token: 'number', foreground: '0550ae' },
    { token: 'string.key.json', foreground: '0550ae' },
  ],
  colors: { 'editor.background': '#ffffff', 'editor.foreground': '#24292f', 'editorCursor.foreground': '#0969da', 'editor.lineHighlightBackground': '#f6f8fa', 'editorLineNumber.foreground': '#6e7781' },
};

export const THEME_DATA: Record<ThemeId, editor.IStandaloneThemeData> = {
  'dataprep-dark':    DATAPREP_DARK,
  'dataprep-light':   DATAPREP_LIGHT,
  'dracula':          DRACULA,
  'monokai':          MONOKAI,
  'one-dark':         ONE_DARK,
  'tokyo-night':      TOKYO_NIGHT,
  'nord':             NORD,
  'solarized-dark':   SOLARIZED_DARK,
  'solarized-light':  SOLARIZED_LIGHT,
  'tomorrow-night':   TOMORROW_NIGHT,
  'github-dark':      GITHUB_DARK,
  'github-light':     GITHUB_LIGHT,
};

// Register every theme with Monaco. Call once after Monaco loads.
// Non-dataprep themes keep ONLY their syntax token rules; editor background and chrome
// always stay pinned to the dataprep base so only text colours change, not the window.
export function registerThemes(monaco: typeof import('monaco-editor')): void {
  monaco.editor.defineTheme('dataprep-dark', DATAPREP_DARK);
  monaco.editor.defineTheme('dataprep-light', DATAPREP_LIGHT);

  for (const [id, data] of Object.entries(THEME_DATA)) {
    if (id === 'dataprep-dark' || id === 'dataprep-light') continue;
    const baseColors = data.base === 'vs' ? DATAPREP_LIGHT.colors : DATAPREP_DARK.colors;
    // Pin background/chrome to dataprep base but apply each theme's own
    // foreground text color. This way background stays stable but syntax and
    // default text colors actually change when the user picks a theme.
    const { 'editor.foreground': _fg, ...chromeColors } = baseColors;
    const ownFg = data.colors?.['editor.foreground'];
    monaco.editor.defineTheme(id, {
      base: data.base,
      inherit: true,
      rules: data.rules,
      colors: {
        ...chromeColors,
        ...(ownFg ? { 'editor.foreground': ownFg } : {}),
      },
    });
  }
}
