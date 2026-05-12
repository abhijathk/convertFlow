declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, string | number> }) => void;
  }
}

function track(event: string, props?: Record<string, string | number>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('dataprep:appSettings');
    if (raw && JSON.parse(raw).telemetryEnabled === false) return;
  } catch { /* if storage unreadable, fall through and track */ }
  window.plausible?.(event, props ? { props } : undefined);
}

export const analytics = {
  datasetPasted:        (lines: number, preset: string) => track('dataset_pasted', { lines, preset }),
  presetSwitched:       (preset: string)                => track('preset_switched', { preset }),
  approxTokensShown:    (tokens: number)               => track('approx_shown', { tokens }),
  exactCalculated:      (tokens: number)               => track('exact_calculated', { tokens }),
  shareCopied:          ()                             => track('share_copied'),
  shareOpenedFromUrl:   ()                             => track('share_opened_from_url'),
  problemClicked:       (line: number)                 => track('problem_clicked', { line }),
  exampleLoaded:        (id: string)                   => track('example_loaded', { example: id }),
  emailSubmitted:       ()                             => track('email_submitted'),
  fileUploaded:         (ext: string)                  => track('file_uploaded', { ext }),
  chunkStrategyPicked:  (strategy: string)             => track('chunk_strategy_picked', { strategy }),
  embedderSwitched:     (embedder: string)             => track('embedder_switched', { embedder }),
};
