<script lang="ts">
  import type { UtilityMeta } from '../lib/utilities/registry';
  import { utilitiesState, setToolPrefilled } from '../stores/utilitiesState';
  import { getActiveFile } from '../stores/editorState';
  import { openFile as editorOpenFile } from '../stores/editorState';
  import { setTab, sendToConvert as shellSendToConvert, sendToChunk as shellSendToChunk } from '../stores/shellState';

  import TokenEstimatorView from './utilities/TokenEstimatorView.svelte';
  import CostCalculatorView from './utilities/CostCalculatorView.svelte';
  import JsonValidatorView from './utilities/JsonValidatorView.svelte';
  import TextTransformerView from './utilities/TextTransformerView.svelte';
  import RegexTesterView from './utilities/RegexTesterView.svelte';
  import EncodingToolsView from './utilities/EncodingToolsView.svelte';
  import HashToolsView from './utilities/HashToolsView.svelte';
  import TimestampToolsView from './utilities/TimestampToolsView.svelte';
  import DatasetSplitterView from './utilities/DatasetSplitterView.svelte';
  import TemplateExpanderView from './utilities/TemplateExpanderView.svelte';
  import DuplicateDetectorView from './utilities/DuplicateDetectorView.svelte';
  import TokenAnalyzerView from './utilities/TokenAnalyzerView.svelte';
  import EmbeddingBudgetView from './utilities/EmbeddingBudgetView.svelte';
  import ConversationFormatterView from './utilities/ConversationFormatterView.svelte';
  import CsvTsvJsonView from './utilities/CsvTsvJsonView.svelte';
  import PiiRedactorView from './utilities/PiiRedactorView.svelte';
  import SchemaMigratorView from './utilities/SchemaMigratorView.svelte';

  interface Props {
    meta: UtilityMeta;
  }

  let { meta }: Props = $props();

  let toolState = $derived($utilitiesState[meta.id] ?? { primaryInput: '', autoPrefilled: false, prefillSourceFileId: null, prefillTruncated: false });

  function loadFullFile() {
    const file = getActiveFile();
    if (!file) return;
    setToolPrefilled(meta.id, file.content, file.id, false);
  }

  function sendToEditor(name: string, content: string) {
    editorOpenFile(name, content);
    setTab('editor');
  }

  function sendToConvert(content: string) {
    shellSendToConvert(content);
  }

  function sendToChunk(content: string) {
    shellSendToChunk(content);
  }
</script>

<div class="tool-panel">
  <div class="tool-header">
    <h2 class="tool-title">{meta.name}</h2>
    <p class="tool-desc">{meta.description}</p>
  </div>

  {#if toolState.prefillTruncated}
    <div class="truncation-strip" role="alert">
      File too large to auto-load — showing first 100KB.
      <button class="load-full-btn" onclick={loadFullFile}>Load full file</button>
    </div>
  {/if}

  {#if meta.id === 'token-estimator'}
    <TokenEstimatorView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'cost-calculator'}
    <CostCalculatorView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'json-validator'}
    <JsonValidatorView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'text-transformer'}
    <TextTransformerView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'regex-tester'}
    <RegexTesterView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'encoding-tools'}
    <EncodingToolsView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'hash-tools'}
    <HashToolsView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'timestamp-tools'}
    <TimestampToolsView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'dataset-splitter'}
    <DatasetSplitterView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'template-expander'}
    <TemplateExpanderView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'duplicate-detector'}
    <DuplicateDetectorView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'token-analyzer'}
    <TokenAnalyzerView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'embedding-budget'}
    <EmbeddingBudgetView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'conversation-formatter'}
    <ConversationFormatterView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'csv-tsv-json'}
    <CsvTsvJsonView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'pii-redactor'}
    <PiiRedactorView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {:else if meta.id === 'schema-migrator'}
    <SchemaMigratorView {meta} {sendToEditor} {sendToConvert} {sendToChunk} />
  {/if}
</div>

<style>
  .tool-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px 24px;
    max-width: 800px;
    width: 100%;
  }
  .tool-header { display: flex; flex-direction: column; gap: 4px; }
  .tool-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
    margin: 0;
  }
  .tool-desc {
    font-size: 12px;
    color: var(--ink-dim);
    margin: 0;
  }
  .truncation-strip {
    background: color-mix(in srgb, #f59e0b 15%, transparent);
    border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .load-full-btn {
    background: none;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    color: var(--ink);
    white-space: nowrap;
  }
  .load-full-btn:hover { background: var(--border); }
  @media (max-width: 500px) {
    .tool-panel { padding: 16px; }
  }
</style>
