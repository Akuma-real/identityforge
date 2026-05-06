import type { AccountRecord, AddressRecord } from './types';
import { cfg } from './config';

export function loadAccounts(): AccountRecord[] {
  try { return JSON.parse(GM_getValue('gha_accounts', '[]')) as AccountRecord[]; } catch (_) { return []; }
}

export function saveAccounts(accounts: AccountRecord[]): void {
  GM_setValue('gha_accounts', JSON.stringify(accounts));
}

export function loadAddressCache(): AddressRecord[] {
  try { return JSON.parse(GM_getValue('gha_address_cache', '[]')) as AddressRecord[]; } catch (_) { return []; }
}

export function saveAddressCache(arr: AddressRecord[]): void {
  GM_setValue('gha_address_cache', JSON.stringify(arr));
}

export function loadUsedAddresses(): Set<string> {
  try { return new Set(JSON.parse(GM_getValue('gha_used_addresses', '[]')) as string[]); } catch (_) { return new Set(); }
}

export function saveUsedAddresses(set: Set<string>): void {
  GM_setValue('gha_used_addresses', JSON.stringify([...set].sort()));
}

export function usedEmailsSet(accounts: AccountRecord[]): Set<string> {
  const s = new Set<string>();
  for (const a of accounts) { if (a.email) s.add(a.email.toLowerCase().trim()); }
  return s;
}

export function usedNamesSet(accounts: AccountRecord[]): Set<string> {
  const s = new Set<string>();
  for (const a of accounts) { if (a.name) s.add(a.name.trim()); }
  return s;
}

export function nextAccountLabel(accounts: AccountRecord[]): string {
  let max = 0;
  for (const a of accounts) {
    const m = a.label && a.label.match(/^account_(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'account_' + String(max + 1).padStart(3, '0');
}

export function getStatus() {
  const accounts = loadAccounts();
  const addressPool = loadAddressCache();
  const usedAddresses = loadUsedAddresses();
  return {
    config_exists: !!(cfg('CLOUDMAIL_LOGIN') && cfg('CLOUDMAIL_PASSWORD')),
    history_count: accounts.length,
    address_count: addressPool.length,
    used_address_count: usedAddresses.size,
    last_account: accounts.length > 0 ? accounts[accounts.length - 1].label : '',
  };
}
