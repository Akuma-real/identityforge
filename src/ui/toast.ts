import { el } from './dom';
import { getTheme } from './theme';

let toastTimer: number | undefined;

export function toast(msg: string, isError?: boolean): void {
  let t = document.getElementById('gha-toast');
  if (!t) {
    t = el('div', { id: 'gha-toast', className: 'gha-toast', role: 'status' });
  }
  t.setAttribute('data-theme', getTheme());
  if (t.parentElement !== document.body) document.body.appendChild(t);

  const text = String(msg);
  const sticky = /^正在|请在|授权可能/.test(text);
  t.innerHTML = '';
  t.setAttribute('role', isError ? 'alert' : 'status');
  t.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  t.className = 'gha-toast' + (isError ? ' error' : (sticky ? '' : ' ok'));
  t.appendChild(el('span', { className: 'gha-toast-icon', 'aria-hidden': 'true' }));
  t.appendChild(el('div', { className: 'gha-toast-message' }, text));
  t.appendChild(el('button', {
    className: 'gha-toast-close',
    type: 'button',
    title: '关闭提示',
    onclick() {
      if (toastTimer) clearTimeout(toastTimer);
      t.classList.remove('show');
    },
  }, '×'));

  requestAnimationFrame(() => { t.classList.add('show'); });
  if (toastTimer) clearTimeout(toastTimer);
  if (!sticky) {
    const timeout = isError ? 18000 : (text.startsWith('已复制') ? 5000 : 9000);
    toastTimer = window.setTimeout(() => { t.classList.remove('show'); }, timeout);
  }
}
