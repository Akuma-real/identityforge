import { DEFAULTS, cfg, setCfg } from '../config';
import {
  checkOAuthStatus,
  revokeOAuth,
  startOAuthFlow,
} from './oauth';
import { changeEmail, generateIdentity, pollLatest, pollVerification } from '../services/identity';
import { fetchAllAddresses } from '../clients/onemap';
import { getStatus, loadAccounts, saveAccounts, saveAddressCache } from '../storage';
import type { AccountRecord } from '../types';
import { testCLIProxyAPIConfig } from '../clients/cliproxyapi';
import { testCloudMailConfig } from '../clients/cloudmail';
import { $, el } from './dom';
import { applyTheme, getTheme, setTheme } from './theme';
import { toast } from './toast';

let selectedAccount: AccountRecord | null = null;
let settingsVisible = false;
let operationBusy = false;

export function buildPanel(): HTMLElement {
  const existing = document.getElementById('gha-panel');
  if (existing) existing.remove();
  const existingToast = document.getElementById('gha-toast');
  if (existingToast) existingToast.remove();

  const panel = el('div', { id: 'gha-panel' });
  const header = el('div', { id: 'gha-header' },
    el('span', { className: 'gha-title' }, 'IdentityForge'),
    el('button', { className: 'gha-btn', id: 'gha-btn-theme', title: '切换主题', onclick: toggleTheme }, getTheme() === 'dark' ? '☀' : '☾'),
    el('button', { className: 'gha-btn', id: 'gha-btn-settings', title: '设置', onclick: toggleSettings }, '⚙'),
    el('button', { className: 'gha-btn', id: 'gha-btn-collapse', title: '折叠', onclick: toggleCollapse }, '▼'),
  );
  panel.appendChild(header);
  panel.appendChild(el('div', { id: 'gha-body' }));
  document.body.appendChild(panel);
  makeDraggable(panel, header);
  return panel;
}

function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let ox = 0;
  let oy = 0;
  let dragging = false;
  handle.addEventListener('mousedown', (e) => {
    if (e.target instanceof HTMLElement && (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT')) return;
    dragging = true;
    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    panel.style.transition = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - panel.offsetWidth)) + 'px';
    panel.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - panel.offsetHeight)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    panel.style.transition = '';
  });
}

function toggleCollapse(): void {
  const panel = $('#gha-panel');
  const btn = $('#gha-btn-collapse');
  if (!panel || !btn) return;
  btn.textContent = panel.classList.toggle('gha-collapsed') ? '▲' : '▼';
}

function toggleSettings(): void {
  settingsVisible = !settingsVisible;
  updateUI();
}

function toggleTheme(): void {
  const newTheme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  const btn = document.getElementById('gha-btn-theme');
  if (btn) btn.textContent = newTheme === 'dark' ? '☀' : '☾';
  toast('已切换到' + (newTheme === 'dark' ? '深色' : '亮色') + '主题');
}

function inputValue(id: string): string {
  const input = document.getElementById(id) as HTMLInputElement | null;
  return input?.value || '';
}

function saveSettingsForm(): void {
  setCfg('CLIPROXYAPI_BASE', inputValue('gha-cfg-cliproxy').trim().replace(/\/+$/, '') || DEFAULTS.CLIPROXYAPI_BASE);
  setCfg('CLIPROXYAPI_MANAGEMENT_KEY', inputValue('gha-cfg-cliproxy-management-key'));
  setCfg('CLOUDMAIL_BASE', inputValue('gha-cfg-cm-base').trim().replace(/\/+$/, '') || DEFAULTS.CLOUDMAIL_BASE);
  setCfg('CLOUDMAIL_LOGIN', inputValue('gha-cfg-cm-login').trim());
  setCfg('CLOUDMAIL_PASSWORD', inputValue('gha-cfg-cm-pass'));
  setCfg('CLOUDMAIL_DOMAIN', inputValue('gha-cfg-cm-domain').trim() || DEFAULTS.CLOUDMAIL_DOMAIN);
  setCfg('CLOUDMAIL_POLL_INTERVAL', parseInt(inputValue('gha-cfg-cm-interval'), 10) || 5);
  setCfg('CLOUDMAIL_POLL_TIMEOUT', parseInt(inputValue('gha-cfg-cm-timeout'), 10) || 600);
}

async function runConfigTest(kind: 'cliproxyapi' | 'cloudmail', button?: HTMLButtonElement): Promise<void> {
  if (button) button.disabled = true;
  try {
    saveSettingsForm();
    toast(kind === 'cliproxyapi' ? '正在测试 CLIProxyAPI...' : '正在测试 CloudMail...');
    const result = kind === 'cliproxyapi' ? await testCLIProxyAPIConfig() : await testCloudMailConfig();
    toast(result.message);
    updateUI();
  } catch (e) {
    toast('测试失败: ' + errorMessage(e), true);
  } finally {
    if (button) button.disabled = false;
  }
}

export function updateUI(): void {
  const body = $('#gha-body');
  if (!body) return;
  body.innerHTML = '';

  const status = getStatus();
  const oauthActive = GM_getValue('gha_oauth_active', false);
  const oauthEmail = GM_getValue('gha_oauth_email', '');

  body.appendChild(el('div', { className: 'gha-status' },
    el('span', { className: 'gha-badge ok' }, `账号: ${status.history_count}`),
    el('span', { className: 'gha-badge ok' }, `地址池: ${status.address_count}`),
    el('span', { className: 'gha-badge ' + (status.config_exists ? 'ok' : 'warn') }, status.config_exists ? 'CloudMail OK' : '未配 CloudMail'),
    el('span', {
      className: 'gha-badge ' + (oauthActive ? 'ok' : 'warn'),
      style: 'cursor:pointer;',
      onclick: () => checkOAuthStatus(updateUI),
      title: oauthEmail || '点击检查',
    }, oauthActive ? `Codex: ${oauthEmail}` : 'Codex: 未授权'),
  ));

  if (settingsVisible) {
    body.appendChild(renderSettings());
  }

  const busy = operationBusy;
  body.appendChild(el('div', { className: 'gha-actions' },
    el('button', { className: 'gha-btn-primary', disabled: busy, onclick: () => doGenerate(false) }, '生成新身份'),
    el('button', { className: 'gha-btn-primary', disabled: busy, style: 'background:#a6e3a1;', onclick: () => doGenerate(true) }, '生成 + 验证码'),
    el('button', { className: 'gha-btn-secondary', onclick: () => { selectedAccount = null; updateUI(); } }, '刷新'),
  ));

  const oaActions = el('div', { className: 'gha-actions' });
  if (!oauthActive) {
    oaActions.appendChild(el('button', { className: 'gha-btn-secondary', style: 'border-color:#f9e2af;color:#f9e2af;', onclick: () => startOAuthFlow(updateUI) }, 'Codex OAuth 授权'));
  }
  oaActions.appendChild(el('button', { className: 'gha-btn-small', onclick: () => checkOAuthStatus(updateUI) }, '检查授权'));
  if (oauthActive) {
    oaActions.appendChild(el('button', { className: 'gha-btn-small', style: 'color:#f38ba8;', onclick: () => revokeOAuth(updateUI) }, '清除授权'));
  }
  body.appendChild(oaActions);

  body.appendChild(el('div', { className: 'gha-section-title' }, '账号列表'));
  const listContainer = el('div', { className: 'gha-account-list' });
  const accounts = loadAccounts();
  if (accounts.length > 0) {
    const reversed = [...accounts].reverse();
    for (const acct of reversed) {
      listContainer.appendChild(el('div', {
        className: 'gha-account-item' + (selectedAccount && selectedAccount.label === acct.label ? ' active' : ''),
        onclick: () => { selectedAccount = acct; updateUI(); },
      },
      el('span', { className: 'gha-acct-label' }, acct.label),
      el('span', { className: 'gha-acct-name' }, acct.name || '(no name)'),
      acct.verification_code ? el('button', {
        className: 'gha-acct-code',
        type: 'button',
        title: '复制验证码',
        onclick: (e: Event) => { e.stopPropagation(); copyValue(acct.verification_code); },
      }, acct.verification_code) : null,
      ));
    }
  } else {
    listContainer.appendChild(el('div', { style: 'padding:12px;text-align:center;color:#6c7086;' }, '暂无账号 — 点击"生成新身份"'));
  }
  body.appendChild(listContainer);

  if (selectedAccount) renderDetail(body, selectedAccount);
  applyTheme(getTheme());
}

function renderSettings(): HTMLElement {
  return el('div', { className: 'gha-settings' },
    el('label', {}, 'CLIProxyAPI 地址'), el('input', { id: 'gha-cfg-cliproxy', value: cfg('CLIPROXYAPI_BASE') }),
    el('label', {}, 'CLIProxyAPI 管理密钥'), el('input', { id: 'gha-cfg-cliproxy-management-key', type: 'password', value: cfg('CLIPROXYAPI_MANAGEMENT_KEY') }),
    el('label', {}, 'CloudMail 地址'), el('input', { id: 'gha-cfg-cm-base', value: cfg('CLOUDMAIL_BASE') }),
    el('label', {}, 'CloudMail 登录邮箱'), el('input', { id: 'gha-cfg-cm-login', value: cfg('CLOUDMAIL_LOGIN') }),
    el('label', {}, 'CloudMail 密码'), el('input', { id: 'gha-cfg-cm-pass', type: 'password', value: cfg('CLOUDMAIL_PASSWORD') }),
    el('label', {}, '邮箱域名'), el('input', { id: 'gha-cfg-cm-domain', value: cfg('CLOUDMAIL_DOMAIN'), placeholder: '@example.com' }),
    el('label', {}, '轮询间隔 (秒)'), el('input', { id: 'gha-cfg-cm-interval', type: 'number', value: String(cfg('CLOUDMAIL_POLL_INTERVAL')) }),
    el('label', {}, '轮询超时 (秒)'), el('input', { id: 'gha-cfg-cm-timeout', type: 'number', value: String(cfg('CLOUDMAIL_POLL_TIMEOUT')) }),
    el('div', { className: 'gha-actions' },
      el('button', { className: 'gha-btn-secondary', onclick: (e: Event) => runConfigTest('cliproxyapi', e.currentTarget as HTMLButtonElement) }, '测试 CLIProxyAPI'),
      el('button', { className: 'gha-btn-secondary', onclick: (e: Event) => runConfigTest('cloudmail', e.currentTarget as HTMLButtonElement) }, '测试 CloudMail'),
    ),
    el('button', {
      className: 'gha-btn-primary',
      onclick: () => {
        saveSettingsForm();
        toast('配置已保存');
        settingsVisible = false;
        updateUI();
      },
    }, '保存配置'),
    el('button', {
      className: 'gha-btn-secondary',
      onclick: () => {
        if (confirm('确定要清空本地所有账号数据？')) {
          GM_setValue('gha_accounts', '[]');
          toast('已清空');
          updateUI();
        }
      },
    }, '清空账号数据'),
    el('button', {
      className: 'gha-btn-secondary',
      onclick: () => {
        if (confirm('确定要清空地址缓存？（下次将从 OneMap 重新获取）')) {
          GM_setValue('gha_address_cache', '[]');
          GM_setValue('gha_used_addresses', '[]');
          toast('已清空');
          updateUI();
        }
      },
    }, '清空地址缓存'),
    el('button', {
      className: 'gha-btn-secondary',
      onclick: async () => {
        toast('正在刷新地址池...');
        try {
          const addrs = await fetchAllAddresses('');
          saveAddressCache(addrs);
          toast(`已刷新: ${addrs.length} 个地址`);
          updateUI();
        } catch (e) {
          toast('刷新失败: ' + errorMessage(e), true);
        }
      },
    }, '刷新地址池 (OneMap)'),
    el('label', { style: 'margin-top:6px;' }, '导入数据（粘贴 JSON 数组或 JSONL）'),
    el('textarea', { id: 'gha-import-data', rows: '4', style: 'background:var(--input-bg);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:4px;font-size:11px;resize:vertical;width:100%;box-sizing:border-box;font-family:monospace;', placeholder: '粘贴 JSON 数据...' }),
    el('button', {
      className: 'gha-btn-secondary',
      onclick: importData,
    }, '导入数据'),
  );
}

function importData(): void {
  const textarea = document.getElementById('gha-import-data') as HTMLTextAreaElement | null;
  const raw = textarea?.value.trim() || '';
  if (!raw) {
    toast('请先粘贴数据', true);
    return;
  }
  try {
    const records = raw.startsWith('[')
      ? JSON.parse(raw) as AccountRecord[]
      : raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as AccountRecord);
    if (!Array.isArray(records) || records.length === 0) throw new Error('Invalid format');
    const existing = loadAccounts();
    const merged = [...existing];
    let added = 0;
    for (const r of records) {
      if (!merged.find(a => a.label === r.label)) {
        merged.push(r);
        added++;
      }
    }
    saveAccounts(merged);
    if (textarea) textarea.value = '';
    toast(`已导入 ${added} 条记录（共 ${records.length} 条，跳过 ${records.length - added} 条重复）`);
    settingsVisible = false;
    updateUI();
  } catch (e) {
    toast('导入失败: ' + errorMessage(e), true);
  }
}

function renderDetail(body: HTMLElement, a: AccountRecord): void {
  const detail = el('div', { className: 'gha-detail' });
  const fields: Array<[string, string | number]> = [
    ['Label', a.label], ['姓名', a.name], ['年龄', a.age], ['生日', a.birthday],
    ['地址', a.address], ['邮编', a.postal_code], ['邮箱', a.email],
    ['验证码', a.verification_code], ['验证时间', a.verification_time], ['创建时间', a.created_at],
  ];
  for (const [label, value] of fields) {
    if (value == null || value === '') continue;
    detail.appendChild(el('div', { className: 'gha-detail-row' },
      el('span', { className: 'gha-detail-label' }, label),
      el('span', { className: 'gha-detail-value' }, String(value)),
      el('button', { className: 'gha-btn-small', onclick: () => copyValue(String(value)) }, '复制'),
    ));
  }
  detail.appendChild(el('div', { className: 'gha-actions', style: 'margin-top:4px;' },
    el('button', { className: 'gha-btn-secondary', onclick: () => doChangeEmail(a.label) }, '更换邮箱'),
    el('button', { className: 'gha-btn-secondary', onclick: () => doPoll(a.label) }, '轮询验证码'),
    el('button', { className: 'gha-btn-secondary', onclick: () => doPollLatest(a.label) }, '快速查码'),
    a.verification_code ? el('button', { className: 'gha-btn-secondary', onclick: () => copyValue(a.verification_code) }, '复制验证码') : null,
    el('button', {
      className: 'gha-btn-secondary',
      onclick: () => {
        const a2 = selectedAccount;
        if (!a2) return;
        copyValue(['Label: ' + a2.label, 'Name: ' + a2.name, 'Age: ' + a2.age, 'Birthday: ' + a2.birthday,
          'Address: ' + a2.address, 'Postal Code: ' + a2.postal_code, 'Email: ' + a2.email,
          a2.verification_code ? 'Code: ' + a2.verification_code : ''].filter(Boolean).join('\n'));
      },
    }, '复制全部'),
  ));
  body.appendChild(detail);
}

function copyValue(text: string): void {
  GM_setClipboard(String(text), 'text');
  toast('已复制: ' + String(text).substring(0, 50));
}

async function doGenerate(waitVerification: boolean): Promise<void> {
  if (operationBusy) return;
  operationBusy = true;
  updateUI();
  try {
    toast('正在生成新身份' + (waitVerification ? '（等待验证码，可能较久）...' : '...'));
    const result = await generateIdentity(waitVerification, toast);
    selectedAccount = result.record;
    toast('生成成功: ' + result.record.name + (result.verification_status === 'received' ? ' | 验证码: ' + result.record.verification_code : ''));
  } catch (e) {
    toast('生成失败: ' + errorMessage(e), true);
  } finally {
    operationBusy = false;
    updateUI();
  }
}

async function doChangeEmail(label: string): Promise<void> {
  if (operationBusy) return;
  operationBusy = true;
  updateUI();
  try {
    toast('正在更换邮箱...');
    const result = await changeEmail(label);
    selectedAccount = result.record;
    toast('邮箱更换完成: ' + result.record.email);
  } catch (e) {
    toast('更换失败: ' + errorMessage(e), true);
  } finally {
    operationBusy = false;
    updateUI();
  }
}

async function doPoll(label: string): Promise<void> {
  if (operationBusy) return;
  operationBusy = true;
  updateUI();
  try {
    toast('正在轮询验证码...');
    const result = await pollVerification(label);
    selectedAccount = result.record;
    toast(result.record.verification_code ? '验证码: ' + result.record.verification_code : '未收到验证码');
  } catch (e) {
    toast('轮询失败: ' + errorMessage(e), true);
  } finally {
    operationBusy = false;
    updateUI();
  }
}

async function doPollLatest(label: string): Promise<void> {
  try {
    toast('正在查询...');
    const result = await pollLatest(label);
    selectedAccount = result.record;
    toast(result.found ? '验证码: ' + result.record.verification_code : '暂无新验证码');
    updateUI();
  } catch (e) {
    toast('查询失败: ' + errorMessage(e), true);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
