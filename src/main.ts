import { buildPanel, updateUI } from './ui/panel';
import { applyTheme, getTheme } from './ui/theme';
import { panelCss, toastCss } from './ui/styles';

function init(): void {
  GM_setValue('gha_busy', false);
  GM_addStyle(panelCss);
  GM_addStyle(toastCss);
  buildPanel();
  applyTheme(getTheme());
  updateUI();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
