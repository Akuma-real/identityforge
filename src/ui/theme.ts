export function getTheme(): string {
  return GM_getValue('gha_theme', 'dark');
}

export function setTheme(t: string): void {
  GM_setValue('gha_theme', t);
  applyTheme(t);
}

export function applyTheme(t: string): void {
  const panel = document.getElementById('gha-panel');
  if (panel) panel.setAttribute('data-theme', t);
  const toastBox = document.getElementById('gha-toast');
  if (toastBox) toastBox.setAttribute('data-theme', t);
}
