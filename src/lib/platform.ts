export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || '';
  if (/Mac|iPhone|iPad|iPod|Darwin/i.test(platform)) return true;
  return /Mac OS X|iPhone|iPad|iPod/.test(nav.userAgent || '');
}

export function mod(): string {
  return isMac() ? '⌘' : 'Ctrl+';
}

export function shortcut(key: string, shift = false): string {
  if (isMac()) {
    return shift ? `⌘⇧${key}` : `⌘${key}`;
  }
  return shift ? `Ctrl+Shift+${key}` : `Ctrl+${key}`;
}
