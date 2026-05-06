import { cfg } from '../config';
import type { AuthFile, OAuthStatus } from '../types';
import { gmFetch } from './http';

function base(): string {
  return cfg('CLIPROXYAPI_BASE').replace(/\/+$/, '');
}

function managementKey(): string {
  return String(cfg('CLIPROXYAPI_MANAGEMENT_KEY') || '').trim();
}

function managementRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = managementKey();
  if (!key) throw new Error('请先填写 CLIProxyAPI 管理密钥');
  return gmFetch<T>(base() + '/v0/management' + path, {
    method,
    body,
    headers: {
      Authorization: 'Bearer ' + key,
      'X-Management-Key': key,
    },
  });
}

export function getOAuthUrl(): Promise<{ url?: string; auth_url?: string; authUrl?: string; state?: string }> {
  return managementRequest('GET', '/codex-auth-url?is_webui=true');
}

export function getOAuthStatus(state: string): Promise<OAuthStatus> {
  if (!state) throw new Error('缺少 OAuth state');
  return managementRequest('GET', '/get-auth-status?state=' + encodeURIComponent(state));
}

export function listAuthFiles(): Promise<unknown> {
  return managementRequest('GET', '/auth-files');
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && /(?:^|\s)HTTP\s+404(?:\D|$)/i.test(error.message);
}

export function isManagementAuthError(error: unknown): boolean {
  return error instanceof Error && /missing\s+management\s+key|invalid\s+management\s+key|unauthorized|forbidden|HTTP\s+401|HTTP\s+403/i.test(error.message);
}

export function codexAuthFromFiles(payload: unknown): AuthFile | null {
  const value = payload as { files?: AuthFile[]; auth_files?: AuthFile[]; data?: AuthFile[] };
  const files = Array.isArray(payload) ? payload :
    (Array.isArray(value.files) ? value.files :
      (Array.isArray(value.auth_files) ? value.auth_files :
        (Array.isArray(value.data) ? value.data : [])));
  return files.find((f) => {
    const haystack = [f.type, f.provider, f.name, f.filename, f.email, f.account_type, f.account].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes('codex');
  }) || null;
}

export async function testCLIProxyAPIConfig(): Promise<{ ok: true; message: string }> {
  const cliproxyBase = cfg('CLIPROXYAPI_BASE');
  if (!cliproxyBase) throw new Error('请先填写 CLIProxyAPI 地址');
  try { new URL(cliproxyBase); } catch (_) { throw new Error('CLIProxyAPI 地址不是有效 URL'); }

  try {
    const authFiles = await listAuthFiles();
    const codexAuth = codexAuthFromFiles(authFiles);
    return {
      ok: true,
      message: codexAuth ? 'CLIProxyAPI 管理接口可用；已发现 Codex 授权文件' : 'CLIProxyAPI 管理接口可用；暂未发现 Codex 授权文件',
    };
  } catch (e) {
    if (isNotFoundError(e)) throw new Error('未找到 CLIProxyAPI 管理接口；请确认地址指向最新服务并已启用管理 API');
    if (isManagementAuthError(e)) throw new Error('CLIProxyAPI 管理密钥无效或远程管理未开启');
    throw e;
  }
}
