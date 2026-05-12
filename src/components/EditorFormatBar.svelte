<script lang="ts">
  interface Props {
    format: string;
    fileExt: string;
    editor: import('monaco-editor').editor.IStandaloneCodeEditor | null;
    content: string;
  }
  let { format, fileExt, editor, content }: Props = $props();

  const TABLE_TEMPLATE = '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| cell | cell | cell |\n| cell | cell | cell |\n';

  // ── Core edit helpers ─────────────────────────────────────────────────────

  function insertAtCursor(text: string) {
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    editor.executeEdits('fmt-bar', [{
      range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text,
    }]);
    editor.focus();
  }

  function wrapSelection(before: string, after = before) {
    if (!editor) return;
    const sel = editor.getSelection();
    if (!sel) return;
    if (sel.isEmpty()) {
      const pos = sel.getStartPosition();
      editor.executeEdits('fmt-bar', [{
        range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
        text: before + after,
      }]);
      // Place cursor between the two wrappers
      editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + before.length });
    } else {
      const selectedText = editor.getModel()?.getValueInRange(sel) ?? '';
      editor.executeEdits('fmt-bar', [{ range: sel, text: before + selectedText + after }]);
    }
    editor.focus();
  }

  function prefixLine(prefix: string) {
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    const model = editor.getModel();
    if (!model) return;
    const line = model.getLineContent(pos.lineNumber);
    // Toggle: remove prefix if already present, otherwise add
    if (line.startsWith(prefix)) {
      editor.executeEdits('fmt-bar', [{
        range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: prefix.length + 1 },
        text: '',
      }]);
    } else {
      editor.executeEdits('fmt-bar', [{
        range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: 1 },
        text: prefix,
      }]);
    }
    editor.focus();
  }

  // ── JSONL helpers ─────────────────────────────────────────────────────────

  function insertJsonlExample() {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    const lastLine = model.getLineContent(lineCount);
    const newLine = JSON.stringify({
      messages: [
        { role: 'user', content: '' },
        { role: 'assistant', content: '' },
      ],
    });
    editor.executeEdits('fmt-bar', [{
      range: { startLineNumber: lineCount, startColumn: lastLine.length + 1, endLineNumber: lineCount, endColumn: lastLine.length + 1 },
      text: (lastLine.trim() ? '\n' : '') + newLine,
    }]);
    editor.focus();
  }

  function insertJsonlSystemMsg() {
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    const model = editor.getModel();
    if (!model) return;
    const line = model.getLineContent(pos.lineNumber);
    try {
      const obj = JSON.parse(line);
      if (Array.isArray(obj.messages)) {
        // Only prepend if there isn't already a system message
        const hasSystem = obj.messages.some((m: any) => m.role === 'system');
        if (!hasSystem) obj.messages.unshift({ role: 'system', content: '' });
        editor.executeEdits('fmt-bar', [{
          range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: line.length + 1 },
          text: JSON.stringify(obj),
        }]);
      }
    } catch {}
    editor.focus();
  }

  let exampleCount = $derived(content.split('\n').filter(l => l.trim()).length);

  // ── JSON helpers ──────────────────────────────────────────────────────────

  function jsonFormat() {
    editor?.trigger('fmt-bar', 'editor.action.formatDocument', null);
    editor?.focus();
  }

  function jsonMinify() {
    if (!editor) return;
    try {
      editor.setValue(JSON.stringify(JSON.parse(content)));
    } catch {}
    editor.focus();
  }

  // ── CSV helpers ───────────────────────────────────────────────────────────

  let csvNonEmptyLines = $derived(content.split('\n').filter(l => l.trim()));
  let csvRows = $derived(Math.max(0, csvNonEmptyLines.length - 1));
  let csvCols = $derived((csvNonEmptyLines[0] ?? '').split(',').length || 0);

  function csvAddRow() {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const firstLine = model.getLineContent(1);
    const colCount = Math.max(1, firstLine.split(',').length);
    const lineCount = model.getLineCount();
    const lastLine = model.getLineContent(lineCount);
    editor.executeEdits('fmt-bar', [{
      range: { startLineNumber: lineCount, startColumn: lastLine.length + 1, endLineNumber: lineCount, endColumn: lastLine.length + 1 },
      text: '\n' + Array(colCount).fill('').join(','),
    }]);
    editor.focus();
  }

  function csvAddColumn() {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const lines = model.getLinesContent();
    const colCount = Math.max(1, (lines[0] ?? '').split(',').length);
    const updated = [
      (lines[0] ?? '') + `,col_${colCount + 1}`,
      ...lines.slice(1).map(l => l + ','),
    ].join('\n');
    const lineCount = model.getLineCount();
    const lastLineLen = model.getLineContent(lineCount).length;
    editor.executeEdits('fmt-bar', [{
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: lineCount, endColumn: lastLineLen + 1 },
      text: updated,
    }]);
    editor.focus();
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  let hasSection = $derived(
    format === 'markdown' || fileExt === 'jsonl' || fileExt === 'json' || fileExt === 'csv'
  );
</script>

{#if hasSection}
  <div class="fmt-bar">
    {#if format === 'markdown'}
      <!-- Headings -->
      <button class="fb-btn" onclick={() => prefixLine('# ')} title="Heading 1 — toggle # prefix">H1</button>
      <button class="fb-btn" onclick={() => prefixLine('## ')} title="Heading 2 — toggle ## prefix">H2</button>
      <button class="fb-btn" onclick={() => prefixLine('### ')} title="Heading 3 — toggle ### prefix">H3</button>
      <div class="fb-sep"></div>
      <!-- Inline style -->
      <button class="fb-btn fb-bold" onclick={() => wrapSelection('**')} title="Bold — wrap selection in **...**">B</button>
      <button class="fb-btn fb-italic" onclick={() => wrapSelection('*')} title="Italic — wrap selection in *...*">I</button>
      <button class="fb-btn fb-strike" onclick={() => wrapSelection('~~')} title="Strikethrough — wrap selection in ~~...~~">S</button>
      <div class="fb-sep"></div>
      <!-- Code -->
      <button class="fb-btn fb-mono" onclick={() => wrapSelection('`')} title="Inline code — wrap in backticks">`code`</button>
      <button class="fb-btn fb-mono" onclick={() => insertAtCursor('\n```\n\n```\n')} title="Code block — insert fenced block">```</button>
      <div class="fb-sep"></div>
      <!-- Lists & structure -->
      <button class="fb-btn" onclick={() => prefixLine('- ')} title="Bullet list — toggle - prefix">• list</button>
      <button class="fb-btn" onclick={() => prefixLine('1. ')} title="Numbered list — toggle 1. prefix">1. list</button>
      <button class="fb-btn" onclick={() => prefixLine('> ')} title="Blockquote — toggle > prefix">&gt; quote</button>
      <div class="fb-sep"></div>
      <!-- Misc -->
      <button class="fb-btn" onclick={() => insertAtCursor('\n---\n')} title="Horizontal rule">--- hr</button>
      <button class="fb-btn" onclick={() => wrapSelection('[', '](url)')} title="Link — wrap selection as [text](url)">[link]</button>
      <button class="fb-btn" onclick={() => wrapSelection('![', '](url)')} title="Image — wrap selection as ![alt](url)">![img]</button>
      <button class="fb-btn" onclick={() => insertAtCursor(TABLE_TEMPLATE)} title="Insert 3x2 table template">▦ table</button>

    {:else if fileExt === 'jsonl'}
      <button class="fb-btn" onclick={insertJsonlExample} title="Append new example with user + assistant messages">+ example</button>
      <button class="fb-btn" onclick={insertJsonlSystemMsg} title="Prepend system message to current line (skips if already present)">+ system</button>
      <div class="fb-sep"></div>
      <span class="fb-info">{exampleCount} {exampleCount === 1 ? 'example' : 'examples'}</span>

    {:else if fileExt === 'json'}
      <button class="fb-btn" onclick={jsonFormat} title="Format / pretty-print JSON (uses Monaco formatter)">format ↵</button>
      <button class="fb-btn" onclick={jsonMinify} title="Minify — remove all whitespace from JSON">minify</button>

    {:else if fileExt === 'csv'}
      <button class="fb-btn" onclick={csvAddRow} title="Append empty row matching column count">+ row</button>
      <button class="fb-btn" onclick={csvAddColumn} title="Add new column col_N to header and all rows">+ column</button>
      <div class="fb-sep"></div>
      <span class="fb-info">{csvRows} {csvRows === 1 ? 'row' : 'rows'} &times; {csvCols} {csvCols === 1 ? 'col' : 'cols'}</span>
    {/if}
  </div>
{/if}

<style>
  .fmt-bar {
    display: flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    gap: 3px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .fmt-bar::-webkit-scrollbar { display: none; }

  .fb-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    font-size: 11px;
    padding: 1px 7px;
    color: var(--ink-dim);
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    line-height: 1.6;
    flex-shrink: 0;
  }
  .fb-btn:hover { background: var(--border); color: var(--ink); }

  .fb-bold   { font-weight: 700; }
  .fb-italic { font-style: italic; }
  .fb-strike { text-decoration: line-through; }
  .fb-mono   { font-family: 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: -0.02em; }

  .fb-sep {
    width: 1px;
    background: var(--border);
    height: 16px;
    margin: 0 3px;
    flex-shrink: 0;
  }

  .fb-info {
    color: var(--muted);
    font-size: 11px;
    padding: 0 4px;
    white-space: nowrap;
  }
</style>
