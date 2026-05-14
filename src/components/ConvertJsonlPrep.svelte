<script lang="ts">
  import { convertState } from '../stores/convertState';
  import { convertPrepState } from '../stores/convertPrepState';
  import type { ImportTemplate } from '../lib/convert-import';
  import PrepLockButton from './PrepLockButton.svelte';
  import { appSettings } from '../stores/appSettings';

  let advancedOn = $derived($appSettings.advancedFeaturesEnabled);
  let hasContent = $derived($convertState.lineCount > 0);
  let prepLocked = $derived(advancedOn && hasContent && !$convertState.prepUnlocked);

  // ── Per-template configuration ────────────────────────────────────────────

  const templateDefs: Record<ImportTemplate, { label: string; defaultPrompt: string; description: string; preview: string }> = {
    'qa': {
      label: 'Q&A skeleton',
      defaultPrompt: 'You are a helpful assistant.',
      description: 'Each chunk → user message. Leave assistant blank to fill in your answers.',
      preview: '{"messages":[{"role":"system","content":"…"},{"role":"user","content":"<chunk>"},{"role":"assistant","content":""}]}',
    },
    'context-answer': {
      label: 'Context-answer',
      defaultPrompt: 'Answer the question based only on the provided context.',
      description: 'Each chunk → system context. Leave user message blank — fill in questions later.',
      preview: '{"messages":[{"role":"system","content":"Context:\\n<chunk>"},{"role":"user","content":""},{"role":"assistant","content":""}]}',
    },
    'instruct': {
      label: 'Instruction',
      defaultPrompt: 'Summarize the following passage.',
      description: 'Alpaca-style. System prompt = instruction field, chunk = input field.',
      preview: '{"instruction":"<system prompt>","input":"<chunk>","output":""}',
    },
  };

  const templateIds: ImportTemplate[] = ['qa', 'context-answer', 'instruct'];

  const TEMPLATE_DEFAULT_PROMPTS: Record<ImportTemplate, string[]> = {
    'qa': [
      'You are a helpful assistant.',
      "Answer the user's question clearly and concisely.",
      'Provide accurate, helpful responses to questions.',
    ],
    'context-answer': [
      'Answer based only on the provided context.',
      'Use the passage below to answer the question accurately.',
      'Reference the context to give your response — do not use outside knowledge.',
    ],
    'instruct': [
      'Summarize the following passage.',
      'Generate a concise summary of the text below.',
      'Provide a TL;DR for this content.',
    ],
  };

  interface AdvancedWarning {
    title: string;
    intro: string;
    bullets: Array<{ kind: 'use' | 'avoid' | 'note'; text: string }>;
  }
  const TEMPLATE_WARNINGS: Record<ImportTemplate, AdvancedWarning> = {
    'qa': {
      title: 'Q&A skeleton — multi-prompt is usually not what you want',
      intro:
        "For a Q&A chatbot, the system prompt defines the assistant's persona and voice. " +
        'Rotating prompts here trains the model to be inconsistent across turns.',
      bullets: [
        { kind: 'avoid', text: 'Skip this for a single-persona chatbot or a focused Q&A model — vary the prompt and the model will learn to switch tone.' },
        { kind: 'use',   text: 'Use it only if you intentionally want a model that follows several distinct personas or response styles.' },
        { kind: 'note',  text: 'Common pattern: keep one prompt for one chatbot. Fine-tune separately if you need multiple personas.' },
      ],
    },
    'context-answer': {
      title: 'Context-answer — multi-prompt varies the wrapper, not the context',
      intro:
        'In RAG-style context-answer datasets, variety mostly comes from the retrieved chunk itself. ' +
        'Multiple system prompts only vary the wrapper phrasing (e.g. "Answer based on:" vs "Use the context to answer:").',
      bullets: [
        { kind: 'use',   text: 'Helps if you want the model to be robust to different wrapper phrasings at inference time.' },
        { kind: 'avoid', text: 'Skip it if you control the wrapper at inference — single-prompt matches the at-runtime template better.' },
        { kind: 'note',  text: 'Context-answer datasets already have strong per-record variety via the context — extra prompt variety is optional polish.' },
      ],
    },
    'instruct': {
      title: 'Instruction — multi-prompt is a strong fit here',
      intro:
        'Instruction-tuning genuinely benefits from prompt variety. The system prompt acts as the instruction; ' +
        'rotating it teaches the model to follow many phrasings of the same task.',
      bullets: [
        { kind: 'use',   text: 'Recommended for instruction-following / multi-task fine-tunes and for training prompt-phrasing robustness.' },
        { kind: 'avoid', text: 'Avoid mixing fundamentally different tasks (e.g. "summarize" and "translate") in one run — the model will learn confusion.' },
        { kind: 'note',  text: 'Best practice: keep all prompts on the same task, just phrased differently. Use separate datasets for different tasks.' },
      ],
    },
  };

  // ── Derived from store ────────────────────────────────────────────────────

  let fmt = $derived($convertState.exportFormat);
  let visible = $derived(fmt === 'jsonl' || fmt === 'alpaca' || fmt === 'sharegpt');
  let showTemplates = $derived(fmt === 'jsonl');
  let showChunkSize = $derived(fmt === 'jsonl' || fmt === 'alpaca' || fmt === 'sharegpt');

  // Local mirror of store values for binding
  let template = $derived($convertPrepState.template);
  let systemPrompt = $derived($convertPrepState.systemPrompt);
  let userEditedPrompt = $derived($convertPrepState.userEditedPrompt);
  let chunkSize = $derived($convertPrepState.chunkSize);
  let multiPromptEnabled = $derived($convertPrepState.multiPromptEnabled);
  let multiPromptMode = $derived($convertPrepState.multiPromptMode);
  let multiPromptSeed = $derived($convertPrepState.multiPromptSeed);
  let multiPrompts = $derived($convertPrepState.multiPrompts);

  let currentDef = $derived(templateDefs[template]);
  let activeWarning = $derived(TEMPLATE_WARNINGS[template]);

  // ── Dialog state (ephemeral — not persisted) ──────────────────────────────

  let confirmingAdvanced = $state(false);
  let advancedDialogOpen = $state(false);
  let confirmingTemplateSwitch = $state(false);
  let lastSeenTemplate = $state<ImportTemplate | null>(null);

  // Local working copies for the advanced dialog (committed on save)
  let dialogMode = $state<'round-robin' | 'random'>('round-robin');
  let dialogSeed = $state(42);
  let dialogPrompts = $state<string[]>([]);

  $effect(() => {
    if (lastSeenTemplate === null) { lastSeenTemplate = template; return; }
    if (lastSeenTemplate === template) return;
    lastSeenTemplate = template;
    if (multiPromptEnabled && multiPrompts.length > 0) {
      confirmingTemplateSwitch = true;
    }
  });

  // ── Store update helpers ──────────────────────────────────────────────────

  function pickTemplate(id: ImportTemplate) {
    convertPrepState.update(s => ({
      ...s,
      template: id,
      systemPrompt: s.userEditedPrompt ? s.systemPrompt : templateDefs[id].defaultPrompt,
    }));
  }

  function setSystemPrompt(value: string) {
    convertPrepState.update(s => ({ ...s, systemPrompt: value, userEditedPrompt: true }));
  }

  function resetSystemPrompt() {
    convertPrepState.update(s => ({ ...s, systemPrompt: templateDefs[s.template].defaultPrompt, userEditedPrompt: false }));
  }

  function setChunkSize(value: number) {
    convertPrepState.update(s => ({ ...s, chunkSize: value }));
  }

  function disableMultiPrompt() {
    convertPrepState.update(s => ({ ...s, multiPromptEnabled: false }));
  }

  function loadNewTemplateDefaults() {
    convertPrepState.update(s => ({
      ...s,
      multiPrompts: [...TEMPLATE_DEFAULT_PROMPTS[s.template], ''],
    }));
    confirmingTemplateSwitch = false;
  }

  function keepCurrentPrompts() {
    confirmingTemplateSwitch = false;
  }

  function openAdvancedWarning() { confirmingAdvanced = true; }
  function dismissAdvancedWarning() { confirmingAdvanced = false; }

  function acceptAdvancedWarning() {
    confirmingAdvanced = false;
    // Seed local dialog copies: prefer store state if already configured,
    // otherwise fall back to the appSettings default mode.
    dialogMode = multiPrompts.length === 0
      ? $appSettings.defaultMultiPromptMode
      : multiPromptMode;
    dialogSeed = multiPromptSeed;
    dialogPrompts = multiPrompts.length === 0
      ? [...TEMPLATE_DEFAULT_PROMPTS[template], '']
      : [...multiPrompts];
    advancedDialogOpen = true;
  }

  function openEditDialog() {
    dialogMode = multiPromptMode;
    dialogSeed = multiPromptSeed;
    dialogPrompts = [...multiPrompts];
    advancedDialogOpen = true;
  }

  function closeAdvancedDialog() { advancedDialogOpen = false; }

  function saveAdvanced() {
    const trimmed = dialogPrompts.map(p => p.trim()).filter(p => p.length > 0);
    convertPrepState.update(s => ({
      ...s,
      multiPromptEnabled: trimmed.length >= 2,
      multiPromptMode: dialogMode,
      multiPromptSeed: dialogSeed,
      multiPrompts: trimmed,
    }));
    advancedDialogOpen = false;
  }

  function addPromptRow() { dialogPrompts = [...dialogPrompts, '']; }
  function removePromptRow(i: number) { dialogPrompts = dialogPrompts.filter((_, j) => j !== i); }
</script>

{#if visible}
  <div class="jsonl-prep-panel">

    {#if showTemplates}
      <!-- Template picker -->
      <div class="prep-row options-row">
        <span class="row-label">Template:</span>
        <div class="template-buttons">
          {#each templateIds as id}
            <button
              class="template-btn"
              class:active={template === id}
              class:locked={prepLocked}
              onclick={() => { if (!prepLocked) pickTemplate(id); }}
              disabled={prepLocked}
              title={prepLocked ? 'Locked — click the lock icon to unlock prep settings' : templateDefs[id].description}
            >{templateDefs[id].label}</button>
          {/each}
        </div>
        <span class="template-desc">{currentDef.description}</span>
        <PrepLockButton />
      </div>

      <!-- Output preview -->
      <div class="prep-row preview-row">
        <span class="row-label">Output:</span>
        <code class="preview-code">{currentDef.preview}</code>
      </div>

      <!-- Combined row: System prompt + Advanced button + Chunk size.
           Wraps to multiple lines on narrow screens. -->
      <div class="prep-row combined-row">
        <div class="prompt-cluster">
          <span class="row-label">System prompt:</span>
          <input
            type="text"
            class="prompt-input"
            class:input-locked={prepLocked}
            value={systemPrompt}
            oninput={(e) => setSystemPrompt((e.target as HTMLInputElement).value)}
            placeholder={currentDef.defaultPrompt}
            disabled={multiPromptEnabled || prepLocked}
            title={prepLocked ? 'Locked — click the lock icon to unlock prep settings' : multiPromptEnabled ? 'Disabled while multi-prompt is on' : undefined}
          />
          {#if userEditedPrompt && !multiPromptEnabled && !prepLocked}
            <button class="reset-btn" onclick={resetSystemPrompt} title="Reset to default">↺</button>
          {/if}
        </div>

        {#if advancedOn}
          <div class="advanced-cluster">
            {#if multiPromptEnabled}
              <span class="multi-prompt-summary" title="{multiPrompts.length} prompts · {multiPromptMode}{multiPromptMode === 'random' ? ` (seed ${multiPromptSeed})` : ''}">
                {multiPrompts.length}·{multiPromptMode === 'round-robin' ? 'RR' : `R${multiPromptSeed}`}
              </span>
              <button type="button" class="advanced-btn" class:locked={prepLocked} disabled={prepLocked} onclick={() => { if (!prepLocked) openEditDialog(); }} title={prepLocked ? 'Locked — click the lock icon to unlock prep settings' : undefined}>edit…</button>
              <button type="button" class="advanced-btn off" class:locked={prepLocked} disabled={prepLocked} onclick={() => { if (!prepLocked) disableMultiPrompt(); }} title={prepLocked ? 'Locked — click the lock icon to unlock prep settings' : 'Disable multi-prompt'}>×</button>
            {:else}
              <button type="button" class="advanced-btn" class:locked={prepLocked} disabled={prepLocked} onclick={() => { if (!prepLocked) openAdvancedWarning(); }} title={prepLocked ? 'Locked — click the lock icon to unlock prep settings' : 'Use multiple system prompts (advanced)'}>
                <span class="advanced-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="8" cy="8" r="2"/>
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/>
                  </svg>
                </span>
                advanced
              </button>
            {/if}
          </div>
        {/if}

        {#if showChunkSize}
          <div class="chunk-cluster">
            <span class="row-label">Chunk size:</span>
            <input
              type="range"
              min="128"
              max="2048"
              step="64"
              value={chunkSize}
              oninput={(e) => { if (!prepLocked) setChunkSize(Number((e.target as HTMLInputElement).value)); }}
              class="slider"
              class:input-locked={prepLocked}
              disabled={prepLocked}
              aria-label="Chunk size in tokens"
              title={prepLocked ? 'Locked — click the lock icon to unlock prep settings' : undefined}
            />
            <span class="chunk-val">{chunkSize}t</span>
          </div>
        {/if}
      </div>
    {:else if showChunkSize}
      <!-- Non-JSONL formats (alpaca/sharegpt) still need chunk size on its own row -->
      <div class="prep-row controls-row">
        <span class="row-label">Chunk size:</span>
        <input
          type="range"
          min="128"
          max="2048"
          step="64"
          value={chunkSize}
          oninput={(e) => { if (!prepLocked) setChunkSize(Number((e.target as HTMLInputElement).value)); }}
          class="slider"
          class:input-locked={prepLocked}
          disabled={prepLocked}
          aria-label="Chunk size in tokens"
          title={prepLocked ? 'Locked — click the lock icon to unlock prep settings' : undefined}
        />
        <span class="chunk-val">{chunkSize}t</span>
        <PrepLockButton />
      </div>
    {/if}

  </div>
{/if}

<!-- Warning dialog -->
{#if confirmingAdvanced}
  <div class="advanced-overlay" role="dialog" aria-modal="true" aria-labelledby="adv-warn-title">
    <div class="advanced-box">
      <p class="advanced-title" id="adv-warn-title">{activeWarning.title}</p>
      <p class="advanced-sub">{activeWarning.intro}</p>
      <ul class="advanced-sub-list">
        {#each activeWarning.bullets as b}
          <li class="warn-bullet warn-{b.kind}">
            {#if b.kind === 'use'}<strong>Use it:</strong>{/if}
            {#if b.kind === 'avoid'}<strong>Avoid:</strong>{/if}
            {#if b.kind === 'note'}<strong>Note:</strong>{/if}
            {b.text}
          </li>
        {/each}
        <li class="warn-bullet warn-meta">You can disable multi-prompt at any time without losing your single prompt.</li>
      </ul>
      <div class="advanced-actions">
        <button class="advanced-confirm-btn danger" onclick={acceptAdvancedWarning}>I understand — continue</button>
        <button class="advanced-confirm-btn" onclick={dismissAdvancedWarning}>cancel</button>
      </div>
    </div>
  </div>
{/if}

<!-- Settings dialog -->
{#if advancedDialogOpen}
  <div class="advanced-overlay" role="dialog" aria-modal="true" aria-labelledby="adv-dlg-title">
    <div class="advanced-box advanced-box-wide">
      <p class="advanced-title" id="adv-dlg-title">Multi-prompt settings</p>
      <p class="advanced-sub">Each generated record will get one system prompt selected by the mode you choose. Add at least 2 prompts. Empty rows are dropped on save.</p>

      <div class="advanced-field-row">
        <span class="advanced-field-label">Mode:</span>
        <label class="advanced-radio">
          <input type="radio" bind:group={dialogMode} value="round-robin" />
          round-robin — cycle 1 → 2 → 3 → 1…
        </label>
        <label class="advanced-radio">
          <input type="radio" bind:group={dialogMode} value="random" />
          random (seeded, reproducible)
        </label>
      </div>

      {#if dialogMode === 'random'}
        <div class="advanced-field-row">
          <span class="advanced-field-label">Seed:</span>
          <input
            type="number"
            class="advanced-seed-input"
            bind:value={dialogSeed}
            min="0"
            max="2147483647"
            aria-label="Random seed"
          />
          <span class="advanced-hint">Same seed + same prompts → same assignments.</span>
        </div>
      {/if}

      <div class="advanced-prompts">
        <span class="advanced-field-label">Prompts:</span>
        {#each dialogPrompts as _, i (i)}
          <div class="advanced-prompt-row">
            <span class="advanced-prompt-index">{i + 1}</span>
            <textarea
              class="advanced-prompt-input"
              bind:value={dialogPrompts[i]}
              placeholder={TEMPLATE_DEFAULT_PROMPTS[template][i % TEMPLATE_DEFAULT_PROMPTS[template].length]}
              rows="2"
            ></textarea>
            <button
              type="button"
              class="advanced-prompt-remove"
              onclick={() => removePromptRow(i)}
              disabled={dialogPrompts.length <= 1}
              aria-label="Remove prompt {i + 1}"
            >×</button>
          </div>
        {/each}
        <button
          type="button"
          class="advanced-prompt-add"
          onclick={() => { dialogPrompts = [...TEMPLATE_DEFAULT_PROMPTS[template], '']; }}
          title="Replace current prompts with the recommended defaults for the {template} template"
        >↺ load defaults for {currentDef.label}</button>
        <button type="button" class="advanced-prompt-add" onclick={addPromptRow}>+ add prompt</button>
      </div>

      <div class="advanced-actions">
        <button class="advanced-confirm-btn danger" onclick={saveAdvanced}>save</button>
        <button class="advanced-confirm-btn" onclick={closeAdvancedDialog}>cancel</button>
      </div>
    </div>
  </div>
{/if}

<!-- Template-switch confirmation dialog -->
{#if confirmingTemplateSwitch}
  <div class="advanced-overlay" role="dialog" aria-modal="true" aria-labelledby="tpl-switch-title">
    <div class="advanced-box">
      <p class="advanced-title" id="tpl-switch-title">Template changed to {currentDef.label}</p>
      <p class="advanced-sub">
        Your multi-prompt list was tailored for the previous template. Load the recommended prompts
        for <strong>{currentDef.label}</strong> instead, or keep your current list?
      </p>
      <div class="advanced-actions">
        <button class="advanced-confirm-btn danger" onclick={loadNewTemplateDefaults}>load defaults</button>
        <button class="advanced-confirm-btn" onclick={keepCurrentPrompts}>keep current</button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.jsonl-prep-panel) {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    font-size: 12px;
  }

  :global(.jsonl-prep-panel .prep-row) {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Combined row: System prompt + Advanced + Chunk size on one line.
     Wraps to the next line at <900px so each cluster keeps its
     own readability. */
  :global(.jsonl-prep-panel .combined-row) {
    flex-wrap: wrap;
    align-items: center;
    row-gap: 8px;
  }
  :global(.jsonl-prep-panel .prompt-cluster) {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 3 1 360px;
    min-width: 280px;
  }
  :global(.jsonl-prep-panel .advanced-cluster) {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }
  :global(.jsonl-prep-panel .chunk-cluster) {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 240px;
    min-width: 200px;
  }
  @media (max-width: 900px) {
    :global(.jsonl-prep-panel .prompt-cluster) {
      flex-basis: 100%;
      min-width: 0;
    }
    :global(.jsonl-prep-panel .advanced-cluster),
    :global(.jsonl-prep-panel .chunk-cluster) {
      flex-basis: auto;
    }
  }

  :global(.jsonl-prep-panel .row-label) {
    color: var(--ink-dim);
    white-space: nowrap;
    min-width: 90px;
  }

  /* Template picker */
  :global(.jsonl-prep-panel .template-buttons) { display: flex; gap: 4px; flex-shrink: 0; }
  :global(.jsonl-prep-panel .template-btn) {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink-dim);
    font-family: inherit;
    font-size: 12px;
    padding: 2px 8px;
    cursor: pointer;
    white-space: nowrap;
  }
  :global(.jsonl-prep-panel .template-btn:hover:not(:disabled)) { color: var(--ink); border-color: var(--ink-dim); }
  :global(.jsonl-prep-panel .template-btn.active) { color: var(--accent); border-color: var(--accent); background: rgba(224, 168, 78, 0.07); }
  :global(.jsonl-prep-panel .template-btn:disabled),
  :global(.jsonl-prep-panel .template-btn.locked) {
    opacity: 0.45;
    color: var(--ink-dim);
    background-color: color-mix(in srgb, var(--ink-dim) 8%, transparent);
    cursor: not-allowed;
    border-color: var(--border);
  }
  :global(.jsonl-prep-panel .template-desc) { color: var(--ink-dim); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }

  /* Output preview */
  :global(.jsonl-prep-panel .preview-code) {
    font-family: inherit;
    font-size: 11px;
    color: var(--syntax-str);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 2px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  /* System prompt input */
  :global(.jsonl-prep-panel .prompt-input) {
    flex: 1;
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 7px;
    outline: none;
  }
  :global(.jsonl-prep-panel .prompt-input:focus) { border-color: var(--accent); }
  :global(.jsonl-prep-panel .prompt-input::placeholder) { color: var(--muted); font-style: italic; }
  :global(.jsonl-prep-panel .prompt-input:disabled) { opacity: 0.4; cursor: not-allowed; }
  :global(.jsonl-prep-panel .prompt-input.input-locked:disabled) {
    opacity: 0.45;
    color: var(--ink-dim);
    background-color: color-mix(in srgb, var(--ink-dim) 8%, transparent);
    cursor: not-allowed;
  }

  :global(.jsonl-prep-panel .reset-btn) {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--ink-dim);
    font-size: 14px;
    padding: 0 3px;
    line-height: 1;
  }
  :global(.jsonl-prep-panel .reset-btn:hover) { color: var(--ink); }

  /* Chunk size slider */
  :global(.jsonl-prep-panel .slider) {
    -webkit-appearance: none;
    appearance: none;
    width: 130px;
    height: 12px;
    background: transparent;
    outline: none;
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    margin: 0;
  }
  :global(.jsonl-prep-panel .slider::-webkit-slider-runnable-track) {
    height: 1px;
    background: var(--accent);
    border: none;
  }
  :global(.jsonl-prep-panel .slider::-webkit-slider-thumb) {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -5.5px;
    background: transparent url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><text x='6' y='10' text-anchor='middle' font-size='14' font-family='monospace' fill='%23e0a84e'>*</text></svg>") no-repeat center;
    background-size: 12px 12px;
    border: none;
    cursor: pointer;
  }
  :global(.jsonl-prep-panel .slider::-moz-range-track) {
    height: 1px;
    background: var(--accent);
    border: none;
  }
  :global(.jsonl-prep-panel .slider::-moz-range-thumb) {
    width: 12px;
    height: 12px;
    background: transparent url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><text x='6' y='10' text-anchor='middle' font-size='14' font-family='monospace' fill='%23e0a84e'>*</text></svg>") no-repeat center;
    background-size: 12px 12px;
    border: none;
    border-radius: 0;
    cursor: pointer;
  }
  :global(.jsonl-prep-panel .chunk-val) { color: var(--accent); font-weight: 500; min-width: 36px; flex-shrink: 0; }
  :global(.jsonl-prep-panel .slider:disabled),
  :global(.jsonl-prep-panel .slider.input-locked) {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Multi-prompt row */
  :global(.jsonl-prep-panel .advanced-row) {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 2px;
  }
  :global(.jsonl-prep-panel .advanced-label) {
    font-size: 11px;
    color: var(--ink-dim);
    letter-spacing: 0.04em;
  }
  :global(.jsonl-prep-panel .multi-prompt-summary) {
    font-size: 11px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-radius: 3px;
    padding: 2px 8px;
  }
  :global(.jsonl-prep-panel .advanced-btn) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    color: var(--accent);
    border-radius: 3px;
    padding: 3px 9px;
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
  }
  :global(.jsonl-prep-panel .advanced-btn:hover:not(:disabled)) { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  :global(.jsonl-prep-panel .advanced-btn.off) { color: var(--ink-dim); border-color: var(--border); }
  :global(.jsonl-prep-panel .advanced-btn.off:hover:not(:disabled)) { color: var(--ink); }
  :global(.jsonl-prep-panel .advanced-btn:disabled),
  :global(.jsonl-prep-panel .advanced-btn.locked) {
    opacity: 0.45;
    cursor: not-allowed;
  }
  :global(.jsonl-prep-panel .advanced-icon) {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* ── Shared dialog styles (also used by ConvertImportPanel) ─────────────── */
  :global(.advanced-overlay) {
    position: fixed;
    inset: 0;
    z-index: 600;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :global(.advanced-box) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 22px 26px;
    width: calc(100vw - 32px);
    max-width: 480px;
    max-height: 85vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  :global(.advanced-box-wide) { max-width: 640px; }
  :global(.advanced-title) { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0; }
  :global(.advanced-sub) { font-size: 12px; color: var(--ink-dim); line-height: 1.5; margin: 0; }
  :global(.advanced-sub-list) { font-size: 12px; color: var(--ink-dim); line-height: 1.5; margin: 0; padding-left: 18px; }
  :global(.advanced-hint) { font-size: 11px; color: var(--muted); }
  :global(.advanced-actions) { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  :global(.advanced-confirm-btn) {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 14px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-dim);
    cursor: pointer;
  }
  :global(.advanced-confirm-btn:hover) { color: var(--ink); border-color: var(--ink-dim); }
  :global(.advanced-confirm-btn.danger) { color: var(--err); border-color: var(--err); }
  :global(.advanced-confirm-btn.danger:hover) { background: color-mix(in srgb, var(--err) 12%, transparent); }
  :global(.advanced-field-row) { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  :global(.advanced-field-label) {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    min-width: 70px;
  }
  :global(.advanced-radio) {
    font-size: 12px;
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
  :global(.advanced-seed-input) {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 8px;
    color: var(--ink);
    font-family: inherit;
    font-size: 12px;
    width: 130px;
  }
  :global(.advanced-prompts),
  :global(.advanced-pool-group) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }
  :global(.advanced-pool-group:first-of-type) { border-top: none; padding-top: 0; }
  :global(.advanced-prompt-row) { display: flex; align-items: flex-start; gap: 6px; }
  :global(.advanced-prompt-index) { font-size: 11px; color: var(--ink-dim); width: 16px; text-align: right; padding-top: 6px; }
  :global(.advanced-prompt-input) {
    flex: 1;
    min-height: 38px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 5px 8px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink);
    resize: vertical;
  }
  :global(.advanced-prompt-input:focus) { border-color: var(--accent); outline: none; }
  :global(.advanced-prompt-remove) {
    background: none;
    border: none;
    color: var(--ink-dim);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 3px;
  }
  :global(.advanced-prompt-remove:hover:not(:disabled)) { color: var(--err); background: color-mix(in srgb, var(--err) 10%, transparent); }
  :global(.advanced-prompt-remove:disabled) { opacity: 0.3; cursor: not-allowed; }
  :global(.advanced-prompt-add) {
    align-self: flex-start;
    margin-top: 4px;
    background: none;
    border: 1px dashed var(--border);
    border-radius: 3px;
    padding: 4px 12px;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-dim);
    cursor: pointer;
  }
  :global(.advanced-prompt-add:hover) { color: var(--accent); border-color: var(--accent); }
  :global(.warn-bullet) { margin-bottom: 4px; }
</style>
