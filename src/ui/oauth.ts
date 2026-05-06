import {
  codexAuthFromFiles,
  getOAuthStatus,
  getOAuthUrl,
  listAuthFiles,
} from '../clients/cliproxyapi';
import type { AuthFile, OAuthStatus } from '../types';
import { toast } from './toast';

let oauthPopup: Window | null = null;

function oauthStatusIsDone(status: OAuthStatus | AuthFile | null): boolean {
  if (!status || typeof status !== 'object') return false;
  const value = status as OAuthStatus;
  const state = String(value.status || value.state || '').toLowerCase();
  return !!(value.active || value.success || value.authenticated || value.is_authenticated ||
    state === 'ok' || state === 'success' || state === 'completed' || state === 'authorized' || state === 'done' ||
    value.email || value.account_email || (value.user && value.user.email));
}

function oauthStatusError(status: OAuthStatus): boolean {
  return status && typeof status === 'object' && String(status.status || '').toLowerCase() === 'error';
}

function oauthEmailFrom(value: OAuthStatus | AuthFile | null): string {
  if (!value || typeof value !== 'object') return '';
  const maybeStatus = value as OAuthStatus;
  return maybeStatus.email || maybeStatus.account_email || maybeStatus.user_email || (maybeStatus.user && maybeStatus.user.email) || '';
}

function setOAuthStateFromAuth(value: OAuthStatus | AuthFile | null, active: boolean): void {
  GM_setValue('gha_oauth_active', !!active);
  GM_setValue('gha_oauth_email', active ? oauthEmailFrom(value) : '');
}

export async function startOAuthFlow(updateUI: () => void): Promise<void> {
  try {
    toast('正在获取授权链接...');
    const res = await getOAuthUrl();
    const authUrl = res && (res.url || res.auth_url || res.authUrl);
    const state = res && res.state;
    if (!authUrl) throw new Error('未能获取授权链接');
    if (!state) throw new Error('授权链接缺少 state');
    GM_setValue('gha_oauth_state', state);

    const w = 600;
    const h = 700;
    oauthPopup = window.open(authUrl, 'gha-oauth', `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2}`);
    if (!oauthPopup) {
      toast('弹窗被阻止，正在新标签页打开...');
      GM_openInTab(authUrl, { active: true });
      toast('请在新标签页完成授权后点"检查授权状态"');
      return;
    }
    toast('请在弹窗中完成 OpenAI 授权');
    const checkInterval = window.setInterval(async () => {
      if (!oauthPopup || oauthPopup.closed) {
        clearInterval(checkInterval);
        oauthPopup = null;
        await completeOAuthFlow(state, updateUI);
        return;
      }
      try {
        const status = await getOAuthStatus(state);
        if (oauthStatusError(status)) {
          clearInterval(checkInterval);
          oauthPopup.close();
          oauthPopup = null;
          toast('授权失败: ' + (status.error || 'Authentication failed'), true);
          return;
        }
        if (oauthStatusIsDone(status)) {
          clearInterval(checkInterval);
          oauthPopup.close();
          oauthPopup = null;
          setOAuthStateFromAuth(status, true);
          toast('授权成功！');
          updateUI();
        }
      } catch (_) {
        // Authorization may still be pending; keep polling until popup closes or times out.
      }
    }, 500);
    window.setTimeout(() => {
      clearInterval(checkInterval);
      if (oauthPopup && !oauthPopup.closed) oauthPopup.close();
    }, 300000);
  } catch (e) {
    toast('授权失败: ' + errorMessage(e), true);
  }
}

async function completeOAuthFlow(state: string, updateUI: () => void): Promise<void> {
  try {
    const status = await getOAuthStatus(state);
    if (oauthStatusError(status)) throw new Error(status.error || 'Authentication failed');
    if (oauthStatusIsDone(status)) {
      setOAuthStateFromAuth(status, true);
      toast('授权成功！');
      updateUI();
      return;
    }
  } catch (_) { }
  try {
    await new Promise(r => setTimeout(r, 3000));
    const s2 = await getOAuthStatus(state);
    if (oauthStatusIsDone(s2)) {
      setOAuthStateFromAuth(s2, true);
      toast('授权成功！');
      updateUI();
      return;
    }
  } catch (_) { }
  toast('授权可能未完成，请重试', true);
}

export async function checkOAuthStatus(updateUI: () => void): Promise<void> {
  try {
    const authFiles = await listAuthFiles();
    const codexAuth = codexAuthFromFiles(authFiles);
    if (codexAuth) {
      setOAuthStateFromAuth(codexAuth, true);
      toast('授权状态: 有效');
    } else {
      setOAuthStateFromAuth(null, false);
      toast('授权状态: 未授权或已过期');
    }
    updateUI();
  } catch (e) {
    toast('检查授权状态失败: ' + errorMessage(e), true);
  }
}

export function revokeOAuth(updateUI: () => void): void {
  GM_setValue('gha_oauth_active', false);
  GM_setValue('gha_oauth_email', '');
  toast('已清除本地授权状态');
  updateUI();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
