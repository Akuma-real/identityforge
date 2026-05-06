import { cfg } from '../config';
import { cmCreateAccount, cmLatestEmails, cmLogin, getCloudMailWebsiteConfig } from '../clients/cloudmail';
import { fetchAllAddresses } from '../clients/onemap';
import { pickUnusedAddress } from '../generator/address';
import { randomAge, randomBirthday } from '../generator/birthday';
import { generateUniqueEmail } from '../generator/email';
import { uniqueName } from '../generator/name';
import { createRNG } from '../generator/random';
import {
  loadAccounts,
  loadAddressCache,
  loadUsedAddresses,
  nextAccountLabel,
  saveAccounts,
  saveAddressCache,
  saveUsedAddresses,
  usedEmailsSet,
  usedNamesSet,
} from '../storage';
import type { AccountRecord, Notify } from '../types';
import { formatTimestampWithOffset } from '../utils/time';
import { extractVerificationCode, formatCMTime } from '../verification';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function ensureAddressPool(notify?: Notify) {
  let addressPool = loadAddressCache();
  if (addressPool.length === 0) {
    notify?.('正在从 OneMap 获取新加坡地址...');
    addressPool = await fetchAllAddresses('');
    if (addressPool.length === 0) throw new Error('无法获取地址数据');
    saveAddressCache(addressPool);
    notify?.(`已加载 ${addressPool.length} 个地址`);
  }
  return addressPool;
}

async function resolveMinEmailPrefix(token: string): Promise<number> {
  let minPrefix = 1;
  try {
    const config = await getCloudMailWebsiteConfig(token);
    if (config && config.minEmailPrefix) minPrefix = config.minEmailPrefix;
    if (config && config.addEmail !== undefined && config.addEmail !== 0) {
      throw new Error('CloudMail 后台未开启添加邮箱功能');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('未开启')) throw e;
  }
  return minPrefix;
}

export async function generateIdentity(waitVerification: boolean, notify?: Notify) {
  const accounts = loadAccounts();
  const rng = createRNG(0);
  const addressPool = await ensureAddressPool(notify);
  const usedAddresses = loadUsedAddresses();

  const usedNames = usedNamesSet(accounts);
  const name = uniqueName(rng, usedNames);
  const age = randomAge(rng);
  const birthday = randomBirthday(rng, age);
  const addr = pickUnusedAddress(rng, addressPool, usedAddresses);
  if (!addr) throw new Error('地址池已耗尽');

  notify?.('正在登录 CloudMail 并创建邮箱...');
  const token = await cmLogin();
  const domain = cfg('CLOUDMAIL_DOMAIN');
  const usedEmails = usedEmailsSet(accounts);
  const minPrefix = await resolveMinEmailPrefix(token);
  const emailAddr = generateUniqueEmail(name, domain, minPrefix, usedEmails, rng);
  const cmAccount = await cmCreateAccount(emailAddr, token);

  const created = formatTimestampWithOffset();
  const record: AccountRecord = {
    label: nextAccountLabel(accounts),
    name,
    age,
    birthday,
    address: addr.full,
    postal_code: addr.postal_code,
    email: emailAddr,
    cloudmail_account_id: cmAccount.accountId,
    all_receive: cmAccount.allReceive || 0,
    latest_email_id: 0,
    verification_code: '',
    verification_time: '',
    created_at: created,
    updated_at: created,
  };

  let verificationStatus = 'not_requested';
  if (waitVerification) {
    notify?.('正在轮询验证码...');
    const interval = Number(cfg('CLOUDMAIL_POLL_INTERVAL')) * 1000;
    const timeout = Number(cfg('CLOUDMAIL_POLL_TIMEOUT')) * 1000;
    const deadline = Date.now() + timeout;
    let lastSeen = 0;

    while (Date.now() < deadline) {
      const emails = await cmLatestEmails(cmAccount.accountId, cmAccount.allReceive, lastSeen, token);
      for (const em of emails) {
        if (em.emailId > lastSeen) lastSeen = em.emailId;
        const code = extractVerificationCode([em.subject, em.text, em.content]);
        if (code) {
          record.verification_code = code;
          record.verification_time = formatCMTime(em.createTime);
          record.latest_email_id = em.emailId;
          verificationStatus = 'received';
          break;
        }
      }
      if (verificationStatus === 'received') break;
      await sleep(interval);
    }
    if (verificationStatus !== 'received') verificationStatus = 'timeout_or_error';
  }

  record.updated_at = new Date().toISOString();
  accounts.push(record);
  saveAccounts(accounts);
  usedAddresses.add(addr.full);
  saveUsedAddresses(usedAddresses);

  return { record, address_pool_count: addressPool.length, used_address_count: usedAddresses.size, verification_status: verificationStatus };
}

export async function changeEmail(label: string) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.label === label);
  if (idx === -1) throw new Error('账号未找到: ' + label);

  const record = accounts[idx];
  const rng = createRNG(0);
  const token = await cmLogin();
  const domain = cfg('CLOUDMAIL_DOMAIN');
  const usedEmails = usedEmailsSet(accounts);
  const usedNames = usedNamesSet(accounts);

  const name = uniqueName(rng, usedNames);
  const age = randomAge(rng);
  const birthday = randomBirthday(rng, age);
  const addressPool = await ensureAddressPool();
  const usedAddresses = loadUsedAddresses();
  const addr = pickUnusedAddress(rng, addressPool, usedAddresses);
  if (!addr) throw new Error('地址池已耗尽');

  const minPrefix = await resolveMinEmailPrefix(token);
  const emailAddr = generateUniqueEmail(name, domain, minPrefix, usedEmails, rng);
  const cmAccount = await cmCreateAccount(emailAddr, token);

  record.name = name;
  record.age = age;
  record.birthday = birthday;
  record.address = addr.full;
  record.postal_code = addr.postal_code;
  record.email = emailAddr;
  record.cloudmail_account_id = cmAccount.accountId;
  record.all_receive = cmAccount.allReceive || 0;
  record.latest_email_id = 0;
  record.verification_code = '';
  record.verification_time = '';
  record.updated_at = new Date().toISOString();

  accounts[idx] = record;
  saveAccounts(accounts);
  usedAddresses.add(addr.full);
  saveUsedAddresses(usedAddresses);

  return { record };
}

export async function pollVerification(label: string) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.label === label);
  if (idx === -1) throw new Error('账号未找到: ' + label);

  const record = accounts[idx];
  const token = await cmLogin();
  const interval = Number(cfg('CLOUDMAIL_POLL_INTERVAL')) * 1000;
  const timeout = Number(cfg('CLOUDMAIL_POLL_TIMEOUT')) * 1000;
  const deadline = Date.now() + timeout;
  let lastSeen = record.latest_email_id || 0;

  while (Date.now() < deadline) {
    const emails = await cmLatestEmails(record.cloudmail_account_id, record.all_receive, lastSeen, token);
    for (const em of emails) {
      if (em.emailId > lastSeen) lastSeen = em.emailId;
      const code = extractVerificationCode([em.subject, em.text, em.content]);
      if (code) {
        record.verification_code = code;
        record.verification_time = formatCMTime(em.createTime);
        record.latest_email_id = em.emailId;
        record.updated_at = new Date().toISOString();
        accounts[idx] = record;
        saveAccounts(accounts);
        return { record };
      }
    }
    await sleep(interval);
  }
  return { record };
}

export async function pollLatest(label: string) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.label === label);
  if (idx === -1) throw new Error('账号未找到: ' + label);

  const record = accounts[idx];
  const token = await cmLogin();
  const lastSeen = record.latest_email_id || 0;
  const emails = await cmLatestEmails(record.cloudmail_account_id, record.all_receive, lastSeen, token);

  let found = false;
  let newLastSeen = lastSeen;
  for (const em of emails) {
    if (em.emailId > newLastSeen) newLastSeen = em.emailId;
    const code = extractVerificationCode([em.subject, em.text, em.content]);
    if (code) {
      record.verification_code = code;
      record.verification_time = formatCMTime(em.createTime);
      record.latest_email_id = em.emailId;
      record.updated_at = new Date().toISOString();
      accounts[idx] = record;
      saveAccounts(accounts);
      found = true;
      break;
    }
  }
  if (!found && newLastSeen > lastSeen) {
    record.latest_email_id = newLastSeen;
    record.updated_at = new Date().toISOString();
    accounts[idx] = record;
    saveAccounts(accounts);
  }
  return { record, found };
}
