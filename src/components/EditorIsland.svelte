<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState, Compartment } from '@codemirror/state';
  import { json } from '@codemirror/lang-json';
  import { markdown } from '@codemirror/lang-markdown';
  import { keymap, placeholder as placeholderExt } from '@codemirror/view';
  import { defaultKeymap } from '@codemirror/commands';
  import { EditorSelection } from '@codemirror/state';
  import { appSettings } from '../stores/appSettings';
  import { getCodeMirrorTheme } from '../lib/codemirror-theme';

  interface Props {
    mode?: 'jsonl' | 'markdown';
    placeholder?: string;
    value?: string;
    ariaLabel?: string;
    editable?: boolean;
    onchange?: (content: string) => void;
  }

  let {
    mode = 'jsonl',
    placeholder = '',
    value = '',
    ariaLabel = 'Code editor',
    editable = true,
    onchange,
  }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;
  const highlightCompartment = new Compartment();

  const dataprepTheme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--surface)',
      color: 'var(--ink)',
      fontSize: '14px',
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
      height: '100%',
    },
    '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
    '.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
    '.cm-gutters': {
      backgroundColor: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      color: 'var(--ink-dim)',
      fontSize: '12px',
      paddingRight: '8px',
    },
    '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '8px', minWidth: '32px' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(224, 168, 78, 0.2)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
    '.cm-placeholder': { color: 'var(--ink-dim)', fontStyle: 'italic' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(224, 168, 78, 0.15)', outline: '1px solid var(--accent)' },
  }, { dark: true });

  onMount(() => {
    const lang = mode === 'jsonl' ? json() : markdown();
    const extensions = [
      basicSetup,
      lang,
      dataprepTheme,
      highlightCompartment.of(getCodeMirrorTheme($appSettings.syntaxTheme)),
      keymap.of(defaultKeymap),
      placeholderExt(placeholder),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onchange?.(update.state.doc.toString());
        }
      }),
    ];
    if (!editable) {
      // Read-only: block typing/paste while keeping selection + scroll + setValue
      extensions.push(EditorState.readOnly.of(true));
      extensions.push(EditorView.editable.of(false));
    }
    const state = EditorState.create({ doc: value, extensions });
    view = new EditorView({ state, parent: container });
  });

  // Reconfigure syntax highlight whenever the global theme changes
  $effect(() => {
    const ext = getCodeMirrorTheme($appSettings.syntaxTheme);
    if (view) view.dispatch({ effects: highlightCompartment.reconfigure(ext) });
  });

  onDestroy(() => {
    if (view) view.destroy();
  });

  export function getValue(): string {
    return view?.state.doc.toString() ?? '';
  }

  export function setValue(text: string) {
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }

  export function appendValue(text: string) {
    if (!view) return;
    const doc = view.state.doc;
    const needsNewline = doc.length > 0 && doc.sliceString(doc.length - 1) !== '\n';
    const insert = (needsNewline ? '\n' : '') + text;
    view.dispatch({ changes: { from: doc.length, to: doc.length, insert } });
  }

  export function jumpToLine(line: number) {
    if (!view) return;
    const doc = view.state.doc;
    const clamped = Math.max(1, Math.min(line, doc.lines));
    const lineInfo = doc.line(clamped);
    view.dispatch({
      selection: EditorSelection.cursor(lineInfo.from),
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
    });
    view.focus();
  }
</script>

<div bind:this={container} class="editor-wrap" role="none"></div>

<style>
  .editor-wrap {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  :global(.editor-wrap .cm-editor) {
    height: 100%;
  }
  :global(.editor-wrap .cm-scroller) {
    overflow: auto;
  }
</style>
