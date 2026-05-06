import { cfg } from '../config';
import type { CloudMailAccount, CloudMailEmail, CloudMailWebsiteConfig } from '../types';

const cmBase = () => cfg('CLOUDMAIL_BASE').replace(/\/+$/, '');

async function cmGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = token;
  const resp = await new Promise<{ code?: number; message?: string; data: T }>((resolve, reject) => {
    GM_xmlhttpRequest({
      url: cmBase() + path,
      method: 'GET',
      headers,
      timeout: 15000,
      onload: (r) => {
        try { resolve(JSON.parse(r.responseText)); }
        catch (_) { reject(new Error('CloudMail parse error')); }
      },
      onerror: () => reject(new Error('CloudMail network error')),
      ontimeout: () => reject(new Error('CloudMail timeout')),
    });
  });
  if (resp.code !== 0 && resp.code !== 200) throw new Error('CloudMail API error ' + resp.code + ': ' + (resp.message || ''));
  return resp.data;
}

async function cmPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = token;
  const resp = await new Promise<{ code?: number; message?: string; data: T }>((resolve, reject) => {
    GM_xmlhttpRequest({
      url: cmBase() + path,
      method: 'POST',
      headers,
      data: JSON.stringify(body),
      timeout: 15000,
      onload: (r) => {
        try { resolve(JSON.parse(r.responseText)); }
        catch (_) { reject(new Error('CloudMail parse error')); }
      },
      onerror: () => reject(new Error('CloudMail network error')),
      ontimeout: () => reject(new Error('CloudMail timeout')),
    });
  });
  if (resp.code !== 0 && resp.code !== 200) {
    const msg = (resp.message || '').toLowerCase();
    if (msg.includes('addaccountdisabled') || msg.includes('add account disabled') ||
      msg.includes('添加账号功能已关闭') || (msg.includes('添加邮箱') && msg.includes('关闭'))) {
      throw new Error('CloudMail 后台未开启多邮箱/添加邮箱');
    }
    throw new Error('CloudMail API error ' + resp.code + ': ' + (resp.message || ''));
  }
  return resp.data;
}

export async function cmLogin(): Promise<string> {
  const email = cfg('CLOUDMAIL_LOGIN');
  const password = cfg('CLOUDMAIL_PASSWORD');
  if (!email || !password) throw new Error('请先在设置中配置 CloudMail 账号和密码');
  const data = await cmPost<{ token?: string }>('/api/login', { email, password });
  if (!data || !data.token) throw new Error('CloudMail 登录失败：未获取到 token');
  return data.token;
}

export async function testCloudMailConfig(): Promise<{ ok: true; message: string }> {
  const email = cfg('CLOUDMAIL_LOGIN');
  const password = cfg('CLOUDMAIL_PASSWORD');
  const domain = cfg('CLOUDMAIL_DOMAIN');
  if (!email || !password) throw new Error('请先填写 CloudMail 登录邮箱和密码');
  if (!domain || !/^@[^@\s]+\.[^@\s]+$/.test(domain)) throw new Error('邮箱域名格式应类似 @example.com');

  const token = await cmLogin();
  let config: CloudMailWebsiteConfig | null = null;
  try {
    config = await getCloudMailWebsiteConfig(token);
  } catch (_) {
    return { ok: true, message: 'CloudMail 登录成功；基础配置读取失败，但登录配置可用' };
  }
  if (config && config.addEmail !== undefined && config.addEmail !== 0) {
    throw new Error('CloudMail 登录成功，但后台未开启添加邮箱功能');
  }
  const minPrefix = config && config.minEmailPrefix ? `；最短邮箱前缀 ${config.minEmailPrefix}` : '';
  return { ok: true, message: 'CloudMail 测试成功' + minPrefix };
}

export async function getCloudMailWebsiteConfig(token: string): Promise<CloudMailWebsiteConfig> {
  return cmGet<CloudMailWebsiteConfig>('/api/setting/websiteConfig', token);
}

export async function cmCreateAccount(email: string, token: string): Promise<Required<CloudMailAccount>> {
  const data = await cmPost<CloudMailAccount>('/api/account/add', { email, token: '' }, token);
  if (!data || !data.accountId) throw new Error('创建邮箱账号失败');
  return { accountId: data.accountId, email: data.email, allReceive: data.allReceive || 0 };
}

export async function cmLatestEmails(accountId: number | string, allReceive: number, lastSeen: number, token: string): Promise<CloudMailEmail[]> {
  const path = '/api/email/latest?emailId=' + lastSeen +
    '&accountId=' + accountId + '&allReceive=' + allReceive;
  const data = await cmGet<CloudMailEmail[]>(path, token);
  return Array.isArray(data) ? data : [];
}
