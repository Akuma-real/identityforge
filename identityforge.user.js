// ==UserScript==
// @name         IdentityForge
// @namespace    https://github.com/Akuma-real/identityforge
// @version      2.0.2
// @description  Standalone AI-assisted Singapore identity generator with CLIProxyAPI integration
// @author       Akuma
// @match        https://*.openai.com/*
// @match        https://auth.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://*.chatgpt.com/*
// @match        https://api.example.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @connect      api.example.com
// @connect      onemap.gov.sg
// @connect      mail.example.com
// @connect      *
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ===================== SEEDED PRNG (Mulberry32) =====================

  function createRNG(seed) {
    if (!seed) seed = Date.now() ^ (Math.random() * 0x100000000);
    let s = seed | 0;
    return {
      next() { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; },
      intn(n) { return Math.floor(this.next() * n); },
    };
  }

  // ===================== CONFIGURATION =====================

  const DEFAULTS = {
    CLIPROXYAPI_BASE: 'https://api.example.com',
    CLIPROXYAPI_MANAGEMENT_KEY: '',
    CLOUDMAIL_BASE: 'https://mail.example.com',
    CLOUDMAIL_LOGIN: '',
    CLOUDMAIL_PASSWORD: '',
    CLOUDMAIL_DOMAIN: '@example.com',
    CLOUDMAIL_POLL_INTERVAL: 5,
    CLOUDMAIL_POLL_TIMEOUT: 600,
  };

  function cfg(key) { return GM_getValue('gha_' + key, DEFAULTS[key]); }
  function setCfg(key, val) { GM_setValue('gha_' + key, val); }

  // ===================== PERSISTENT STORAGE =====================

  function loadAccounts() {
    try { return JSON.parse(GM_getValue('gha_accounts', '[]')); } catch (_) { return []; }
  }
  function saveAccounts(accounts) {
    GM_setValue('gha_accounts', JSON.stringify(accounts));
  }
  function loadAddressCache() {
    try { return JSON.parse(GM_getValue('gha_address_cache', '[]')); } catch (_) { return []; }
  }
  function saveAddressCache(arr) {
    GM_setValue('gha_address_cache', JSON.stringify(arr));
  }
  function loadUsedAddresses() {
    try { return new Set(JSON.parse(GM_getValue('gha_used_addresses', '[]'))); } catch (_) { return new Set(); }
  }
  function saveUsedAddresses(set) {
    GM_setValue('gha_used_addresses', JSON.stringify([...set].sort()));
  }
  function usedEmailsSet(accounts) {
    const s = new Set();
    for (const a of accounts) { if (a.email) s.add(a.email.toLowerCase().trim()); }
    return s;
  }
  function usedNamesSet(accounts) {
    const s = new Set();
    for (const a of accounts) { if (a.name) s.add(a.name.trim()); }
    return s;
  }
  function nextAccountLabel(accounts) {
    let max = 0;
    for (const a of accounts) {
      const m = a.label && a.label.match(/^account_(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return 'account_' + String(max + 1).padStart(3, '0');
  }

  // ===================== NAME GENERATION =====================

  const englishGivenNames = [
    "Adrian", "Alicia", "Brandon", "Cheryl", "Darren", "Evelyn", "Felicia",
    "Gerald", "Hannah", "Isaac", "Jasmine", "Kenneth", "Lydia", "Marcus",
    "Nadia", "Pravin", "Rina", "Suresh", "Terence", "Vanessa", "Wei Jie", "Xin Yi",
  ];
  const chineseSurnames = [
    "Tan", "Lim", "Lee", "Ng", "Ong", "Wong", "Chua", "Koh", "Goh", "Teo", "Yeo", "Low",
  ];
  const chineseGivenParts = [
    "Wei", "Jun", "Ming", "Kai", "Jie", "Hui", "Xuan", "Yi", "Ling", "Mei",
  ];
  const malayGivenNames = [
    "Nur", "Aisyah", "Farhan", "Hafiz", "Irfan", "Siti", "Amirah", "Hakim",
    "Zul", "Danish", "Nadia", "Rafiq",
  ];
  const malaySurnames = [
    "Rahman", "Hassan", "Ismail", "Yusof", "Salleh", "Ibrahim", "Osman",
  ];
  const indianGivenNames = [
    "Arjun", "Priya", "Kavitha", "Ravi", "Anjali", "Vikram", "Meena",
    "Devan", "Lakshmi", "Kiran", "Nisha", "Sanjay",
  ];
  const indianSurnames = [
    "Menon", "Pillai", "Nair", "Rajan", "Krishnan", "Kumar", "Singh",
  ];

  function pick(rng, arr) { return arr.length ? arr[rng.intn(arr.length)] : ''; }

  function generateName(rng) {
    switch (rng.intn(4)) {
      case 0: return pick(rng, englishGivenNames) + ' ' + pick(rng, chineseSurnames);
      case 1: return pick(rng, chineseSurnames) + ' ' + pick(rng, chineseGivenParts) + ' ' + pick(rng, chineseGivenParts);
      case 2: return pick(rng, malayGivenNames) + ' bin ' + pick(rng, malaySurnames);
      default: return pick(rng, indianGivenNames) + ' ' + pick(rng, indianSurnames);
    }
  }

  function uniqueName(rng, usedNames) {
    for (let i = 0; i < 100; i++) {
      const n = generateName(rng);
      if (!usedNames.has(n)) return n;
    }
    // Fallback with numeric suffix
    for (let i = 100; i < 1000; i++) {
      const n = generateName(rng) + ' ' + String(i).padStart(3, '0');
      if (!usedNames.has(n)) return n;
    }
    return generateName(rng) + ' ' + Date.now();
  }

  // ===================== AGE / BIRTHDAY GENERATION =====================

  function randomAge(rng) { return 18 + rng.intn(33); } // 18..50

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate(); // month is 1-based for JS Date
  }

  function randomBirthday(rng, age, now) {
    const year = (now || new Date()).getFullYear() - age;
    const month = 1 + rng.intn(12);
    const day = 1 + rng.intn(daysInMonth(year, month));
    return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  // ===================== EMAIL GENERATION =====================

  const EMAIL_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

  function randomEmailSuffix(rng, n) {
    let s = '';
    for (let i = 0; i < n; i++) s += EMAIL_ALPHABET[rng.intn(36)];
    return s;
  }

  function nameSlug(name) {
    let slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) slug = 'user';
    if (slug.length > 32) slug = slug.slice(0, 32).replace(/-+$/, '') || 'user';
    return slug;
  }

  function generateUniqueEmail(name, domain, minPrefix, used, rng) {
    domain = domain.trim().toLowerCase();
    if (!domain.startsWith('@')) domain = '@' + domain;
    if (!domain || domain === '@') throw new Error('Invalid email domain');
    if (minPrefix < 1) minPrefix = 1;

    let base = 'sg-' + nameSlug(name);
    while (base.length < minPrefix) base += '-x';

    for (let i = 0; i < 500; i++) {
      const email = base + '-' + randomEmailSuffix(rng, 6) + domain;
      if (!used.has(email)) return email;
    }
    throw new Error('Failed to generate unique email');
  }

  // ===================== ONEMAP CLIENT =====================

  const ONEMAP_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
  const NON_RESIDENTIAL = [
    "MRT", "BUS INTERCHANGE", "MARKET", "SCHOOL", "PARK", "MALL", "LIBRARY",
    "POLICE", "HOSPITAL", "CLINIC", "TEMPLE", "CHURCH", "MOSQUE", "HOTEL",
    "COMMUNITY CLUB", "HAWKER", "FOOD CENTRE", "STADIUM", "DEPOT",
  ];
  const QUERY_SEEDS = [
    "ANG MO KIO", "BEDOK", "TAMPINES", "WOODLANDS", "YISHUN", "JURONG WEST",
    "HOUGANG", "SENGKANG", "PUNGGOL", "CLEMENTI", "QUEENSTOWN", "TOA PAYOH",
  ];

  function displayAddress(full) {
    let trimmed = full.trim();
    if (!trimmed) return '';
    let parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const secondLast = parts[parts.length - 2];
      if (/^\d{6}$/.test(last) && secondLast.toUpperCase() === 'SINGAPORE') {
        parts = parts.slice(0, -2);
      }
    }
    return parts.join(' ');
  }

  function normalizeAddress(result) {
    const block = (result.BLK_NO || '').trim();
    const road = (result.ROAD_NAME || '').trim();
    const postal = (result.POSTAL || '').trim();
    const address = (result.ADDRESS || '').trim();
    const building = (result.BUILDING || '').trim();
    const searchVal = (result.SEARCHVAL || '').trim();

    if (!block || !road || !address) return null;
    if (!/^\d{6}$/.test(postal)) return null;
    if (!/^[0-9]{1,4}[A-Z]?$/i.test(block)) return null;

    const source = [searchVal, building, address, block, road].join(' ').toUpperCase();
    for (const term of NON_RESIDENTIAL) {
      if (source.includes(term)) return null;
    }

    const roadUpper = road.toUpperCase();
    const full = displayAddress(block + ' ' + roadUpper + ' SINGAPORE ' + postal);
    return { block, road: roadUpper, postal_code: postal, full };
  }

  async function fetchOneMapPage(searchVal, pageNum, token) {
    const params = new URLSearchParams({ searchVal, returnGeom: 'N', getAddrDetails: 'Y', pageNum: String(pageNum) });
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const response = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: ONEMAP_URL + '?' + params.toString(),
        method: 'GET',
        headers,
        timeout: 15000,
        onload: (r) => {
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(new Error('OneMap parse error')); }
        },
        onerror: () => reject(new Error('OneMap network error')),
        ontimeout: () => reject(new Error('OneMap timeout')),
      });
    });
    return response;
  }

  async function fetchAllAddresses(token) {
    const all = [];
    for (const seed of QUERY_SEEDS) {
      try {
        let page = 1;
        const first = await fetchOneMapPage(seed, 1, token);
        if (!first || first.found === 0) continue;
        for (const r of first.results || []) {
          const addr = normalizeAddress(r);
          if (addr) all.push(addr);
        }
        const totalPages = first.totalNumPages || 1;
        for (page = 2; page <= totalPages; page++) {
          const pg = await fetchOneMapPage(seed, page, token);
          for (const r of pg.results || []) {
            const addr = normalizeAddress(r);
            if (addr) all.push(addr);
          }
        }
      } catch (_) { /* skip failed seeds */ }
    }

    // Deduplicate by full address
    const seen = new Set();
    const unique = [];
    for (const a of all) {
      if (!seen.has(a.full)) { seen.add(a.full); unique.push(a); }
    }
    unique.sort((a, b) => a.full.localeCompare(b.full));
    return unique;
  }

  function pickUnusedAddress(rng, addressPool, usedAddresses) {
    const available = addressPool.filter(a => !usedAddresses.has(a.full));
    if (available.length === 0) {
      // Reset used set if pool exhausted
      usedAddresses.clear();
      saveUsedAddresses(usedAddresses);
      return addressPool.length ? addressPool[rng.intn(addressPool.length)] : null;
    }
    return available[rng.intn(available.length)];
  }

  // ===================== CLOUDMAIL CLIENT =====================

  const CM_BASE = () => cfg('CLOUDMAIL_BASE').replace(/\/+$/, '');

  async function cmGet(path, token) {
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = token;
    const resp = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: CM_BASE() + path,
        method: 'GET',
        headers,
        timeout: 15000,
        onload: (r) => {
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(new Error('CloudMail parse error')); }
        },
        onerror: () => reject(new Error('CloudMail network error')),
        ontimeout: () => reject(new Error('CloudMail timeout')),
      });
    });
    if (resp.code !== 0 && resp.code !== 200) throw new Error('CloudMail API error ' + resp.code + ': ' + (resp.message || ''));
    return resp.data;
  }

  async function cmPost(path, body, token) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers['Authorization'] = token;
    const resp = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: CM_BASE() + path,
        method: 'POST',
        headers,
        data: JSON.stringify(body),
        timeout: 15000,
        onload: (r) => {
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(new Error('CloudMail parse error')); }
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

  async function cmLogin() {
    const email = cfg('CLOUDMAIL_LOGIN');
    const password = cfg('CLOUDMAIL_PASSWORD');
    if (!email || !password) throw new Error('请先在设置中配置 CloudMail 账号和密码');
    const data = await cmPost('/api/login', { email, password });
    if (!data || !data.token) throw new Error('CloudMail 登录失败：未获取到 token');
    return data.token;
  }

  async function testCloudMailConfig() {
    const email = cfg('CLOUDMAIL_LOGIN');
    const password = cfg('CLOUDMAIL_PASSWORD');
    const domain = cfg('CLOUDMAIL_DOMAIN');
    if (!email || !password) throw new Error('请先填写 CloudMail 登录邮箱和密码');
    if (!domain || !/^@[^@\s]+\.[^@\s]+$/.test(domain)) throw new Error('邮箱域名格式应类似 @example.com');

    const token = await cmLogin();
    let config = null;
    try {
      config = await cmGet('/api/setting/websiteConfig', token);
    } catch (_) {
      return { ok: true, message: 'CloudMail 登录成功；基础配置读取失败，但登录配置可用' };
    }
    if (config && config.addEmail !== undefined && config.addEmail !== 0) {
      throw new Error('CloudMail 登录成功，但后台未开启添加邮箱功能');
    }
    const minPrefix = config && config.minEmailPrefix ? `；最短邮箱前缀 ${config.minEmailPrefix}` : '';
    return { ok: true, message: 'CloudMail 测试成功' + minPrefix };
  }

  async function cmCreateAccount(email, token) {
    const data = await cmPost('/api/account/add', { email, token: '' }, token);
    if (!data || !data.accountId) throw new Error('创建邮箱账号失败');
    return { accountId: data.accountId, email: data.email, allReceive: data.allReceive || 0 };
  }

  async function cmLatestEmails(accountId, allReceive, lastSeen, token) {
    const path = '/api/email/latest?emailId=' + lastSeen +
      '&accountId=' + accountId + '&allReceive=' + allReceive;
    const data = await cmGet(path, token);
    return Array.isArray(data) ? data : [];
  }

  // ===================== VERIFICATION CODE EXTRACTION =====================

  function searchableText(value) {
    if (!value) return '';
    let text = value.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  }

  function extractVerificationCode(parts) {
    const contextRe = /(?:verification|temporary|code|验证码)[^\d]{0,120}(\d{6})/i;
    const bareRe = /\b\d{6}\b/;
    for (const p of parts) {
      const text = searchableText(p);
      if (!text) continue;
      const ctxMatch = text.match(contextRe);
      if (ctxMatch) return ctxMatch[1];
    }
    for (const p of parts) {
      const text = searchableText(p);
      if (!text) continue;
      const bareMatch = text.match(bareRe);
      if (bareMatch) return bareMatch[0];
    }
    return '';
  }

  function formatCMTime(value) {
    if (!value) return '';
    try {
      // Input: "2006-01-02 15:04:05" UTC
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (!m) return value;
      const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
      if (isNaN(utc.getTime())) return value;
      const local = new Date(utc.getTime() - utc.getTimezoneOffset() * 60000);
      const pad = (n) => String(n).padStart(2, '0');
      return local.getFullYear() + '-' + pad(local.getMonth() + 1) + '-' + pad(local.getDate()) +
        ' ' + pad(local.getHours()) + ':' + pad(local.getMinutes()) + ':' + pad(local.getSeconds());
    } catch (_) { return value; }
  }

  // ===================== IDENTITY GENERATION ORCHESTRATOR =====================

  async function generateIdentity(waitVerification) {
    const accounts = loadAccounts();
    const rng = createRNG(0);

    // Step 1: Ensure address pool
    let addressPool = loadAddressCache();
    let usedAddresses = loadUsedAddresses();
    if (addressPool.length === 0) {
      toast('正在从 OneMap 获取新加坡地址...');
      const token = ''; // OneMap token (optional, can set via env)
      addressPool = await fetchAllAddresses(token);
      if (addressPool.length === 0) throw new Error('无法获取地址数据');
      saveAddressCache(addressPool);
      toast(`已加载 ${addressPool.length} 个地址`);
    }

    // Step 2: Generate name
    const usedNames = usedNamesSet(accounts);
    const name = uniqueName(rng, usedNames);
    const age = randomAge(rng);
    const birthday = randomBirthday(rng, age);
    const addr = pickUnusedAddress(rng, addressPool, usedAddresses);
    if (!addr) throw new Error('地址池已耗尽');

    // Step 3: Create CloudMail account
    toast('正在登录 CloudMail 并创建邮箱...');
    const token = await cmLogin();
    const domain = cfg('CLOUDMAIL_DOMAIN');
    const usedEmails = usedEmailsSet(accounts);

    // Get website config for minEmailPrefix
    let minPrefix = 1;
    try {
      const config = await cmGet('/api/setting/websiteConfig', token);
      if (config && config.minEmailPrefix) minPrefix = config.minEmailPrefix;
      if (config && config.addEmail !== undefined && config.addEmail !== 0) {
        throw new Error('CloudMail 后台未开启添加邮箱功能');
      }
    } catch (e) {
      if (e.message.includes('未开启')) throw e;
      // Non-critical, proceed with default minPrefix
    }

    const emailAddr = generateUniqueEmail(name, domain, minPrefix, usedEmails, rng);
    const cmAccount = await cmCreateAccount(emailAddr, token);

    // Step 4: Build account record
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    const created = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) +
      'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()) +
      (now.getTimezoneOffset() <= 0 ? '+08:00' : '-05:00');

    const record = {
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

    // Step 5: Poll for verification if requested
    let verificationStatus = 'not_requested';
    if (waitVerification) {
      toast('正在轮询验证码...');
      const interval = cfg('CLOUDMAIL_POLL_INTERVAL') * 1000;
      const timeout = cfg('CLOUDMAIL_POLL_TIMEOUT') * 1000;
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
        await new Promise(r => setTimeout(r, interval));
      }
      if (verificationStatus !== 'received') verificationStatus = 'timeout_or_error';
    }

    // Step 6: Save
    record.updated_at = new Date().toISOString();
    accounts.push(record);
    saveAccounts(accounts);
    usedAddresses.add(addr.full);
    saveUsedAddresses(usedAddresses);

    return { record, address_pool_count: addressPool.length, used_address_count: usedAddresses.size, verification_status: verificationStatus };
  }

  async function changeEmail(label) {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.label === label);
    if (idx === -1) throw new Error('账号未找到: ' + label);

    const record = accounts[idx];
    const rng = createRNG(0);
    const token = await cmLogin();
    const domain = cfg('CLOUDMAIL_DOMAIN');
    const usedEmails = usedEmailsSet(accounts);
    const usedNames = usedNamesSet(accounts);

    // Generate new name
    const name = uniqueName(rng, usedNames);
    const age = randomAge(rng);
    const birthday = randomBirthday(rng, age);

    // Generate new address
    let addressPool = loadAddressCache();
    let usedAddresses = loadUsedAddresses();
    if (addressPool.length === 0) {
      addressPool = await fetchAllAddresses('');
      saveAddressCache(addressPool);
    }
    const addr = pickUnusedAddress(rng, addressPool, usedAddresses);

    let minPrefix = 1;
    try {
      const cfg2 = await cmGet('/api/setting/websiteConfig', token);
      if (cfg2 && cfg2.minEmailPrefix) minPrefix = cfg2.minEmailPrefix;
    } catch (_) { }

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
    if (addr) { usedAddresses.add(addr.full); saveUsedAddresses(usedAddresses); }

    return { record };
  }

  async function pollVerification(label) {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.label === label);
    if (idx === -1) throw new Error('账号未找到: ' + label);

    const record = accounts[idx];
    const token = await cmLogin();
    const interval = cfg('CLOUDMAIL_POLL_INTERVAL') * 1000;
    const timeout = cfg('CLOUDMAIL_POLL_TIMEOUT') * 1000;
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
      await new Promise(r => setTimeout(r, interval));
    }
    return { record };
  }

  async function pollLatest(label) {
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

  function getStatus() {
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

  // ===================== CSS STYLES =====================

  const panelCss = `
/* === IdentityForge — Theme Styles === */
/* Dark theme (default) via CSS custom properties on #gha-panel             */
/* Light theme via #gha-panel[data-theme="light"]                          */

#gha-panel {
  --bg: #1e1e2e;
  --bg2: #181825;
  --border: #313244;
  --text: #cdd6f4;
  --subtext: #a6adc8;
  --muted: #6c7086;
  --primary: #cba6f7;
  --primary-hover: #b4befe;
  --primary-text: #1e1e2e;
  --blue: #89b4fa;
  --green: #a6e3a1;
  --yellow: #f9e2af;
  --red: #f38ba8;
  --btn-bg: #313244;
  --btn-hover: #45475a;
  --input-bg: #1e1e2e;
  --scrollbar: #45475a;
  --shadow: rgba(0,0,0,0.4);

  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483647;
  width: 400px;
  max-height: 600px;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  border-radius: 12px;
  box-shadow: 0 8px 32px var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

#gha-panel[data-theme="light"] {
  --bg: #eff1f5;
  --bg2: #e6e9ef;
  --border: #ccd0da;
  --text: #4c4f69;
  --subtext: #5c5f77;
  --muted: #8c8fa1;
  --primary: #8839ef;
  --primary-hover: #7c38dd;
  --primary-text: #eff1f5;
  --blue: #1e66f5;
  --green: #40a02b;
  --yellow: #df8e1d;
  --red: #d20f39;
  --btn-bg: #ccd0da;
  --btn-hover: #bcc0cc;
  --input-bg: #eff1f5;
  --scrollbar: #acb0be;
  --shadow: rgba(0,0,0,0.15);
}

#gha-panel.gha-collapsed { max-height: 40px; }

#gha-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}
#gha-header .gha-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--primary);
  flex: 1;
}
#gha-header .gha-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  line-height: 1;
  border-radius: 4px;
}
#gha-header .gha-btn:hover { color: var(--text); background: var(--btn-bg); }

#gha-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#gha-body::-webkit-scrollbar { width: 6px; }
#gha-body::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

.gha-status { display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--subtext); }
.gha-status .gha-badge {
  background: var(--btn-bg);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.gha-status .gha-badge.ok { color: var(--green); }
.gha-status .gha-badge.warn { color: var(--yellow); }
.gha-status .gha-badge.err { color: var(--red); }

.gha-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.gha-btn-primary {
  background: var(--primary);
  color: var(--primary-text);
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.gha-btn-primary:hover { background: var(--primary-hover); }
.gha-btn-primary:disabled { background: var(--btn-hover); color: var(--muted); cursor: not-allowed; }
.gha-btn-secondary {
  background: var(--btn-bg);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.gha-btn-secondary:hover { background: var(--btn-hover); }
.gha-btn-small {
  background: var(--btn-bg);
  color: var(--subtext);
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
}
.gha-btn-small:hover { background: var(--btn-hover); color: var(--text); }

.gha-account-list { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; }
.gha-account-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  background: var(--bg2);
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  gap: 8px;
}
.gha-account-item:hover { border-color: var(--border); }
.gha-account-item.active { border-color: var(--primary); }
.gha-account-item .gha-acct-label { font-weight: 600; font-size: 11px; color: var(--blue); min-width: 80px; }
.gha-account-item .gha-acct-name {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gha-account-item .gha-acct-code {
  background: var(--btn-bg);
  color: var(--green);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.gha-account-item .gha-acct-code:hover {
  background: var(--btn-hover);
  border-color: var(--green);
}

.gha-detail { background: var(--bg2); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.gha-detail-row { display: flex; align-items: center; gap: 6px; }
.gha-detail-label { font-size: 10px; color: var(--muted); text-transform: uppercase; min-width: 60px; }
.gha-detail-value { flex: 1; font-size: 12px; word-break: break-all; }
.gha-detail .gha-btn-small { flex-shrink: 0; }

.gha-settings { background: var(--bg2); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.gha-settings label { font-size: 11px; color: var(--muted); }
.gha-settings input, .gha-settings select {
  background: var(--input-bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
}
.gha-settings input:focus { outline: none; border-color: var(--primary); }
.gha-settings input[type="password"] { -webkit-text-security: disc; }

.gha-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: gha-spin 0.6s linear infinite;
}
@keyframes gha-spin { to { transform: rotate(360deg); } }

.gha-section-title {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.gha-theme-btn {
  background: none !important;
  border: none !important;
  cursor: pointer !important;
  font-size: 14px !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  line-height: 1 !important;
}
.gha-theme-btn:hover { background: var(--btn-bg) !important; }
`;
  GM_addStyle(panelCss);
  GM_addStyle(`
    #gha-toast.gha-toast {
      --bg2: #181825;
      --border: #313244;
      --text: #cdd6f4;
      --muted: #6c7086;
      --primary: #cba6f7;
      --green: #a6e3a1;
      --red: #f38ba8;
      --btn-hover: #45475a;
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) 22px;
      align-items: start;
      gap: 8px;
      width: min(560px, calc(100vw - 32px));
      margin: 0;
      max-height: 0;
      box-sizing: border-box;
      background: var(--bg2);
      color: var(--text);
      border: 1px solid var(--border);
      border-left: 3px solid var(--primary);
      padding: 0 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.55;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 0.18s ease, transform 0.18s ease, max-height 0.18s ease, padding 0.18s ease, margin 0.18s ease;
      pointer-events: auto;
      overflow: hidden;
      box-shadow: 0 6px 20px rgba(0,0,0,0.22);
    }
    #gha-toast.gha-toast[data-theme="light"] {
      --bg2: #e6e9ef;
      --border: #ccd0da;
      --text: #4c4f69;
      --muted: #8c8fa1;
      --primary: #8839ef;
      --green: #40a02b;
      --red: #d20f39;
      --btn-hover: #bcc0cc;
    }
    #gha-toast.gha-toast.show {
      max-height: min(420px, calc(100vh - 32px));
      padding: 10px;
      opacity: 1;
      transform: translateY(0);
      overflow-y: auto;
    }
    #gha-toast.gha-toast .gha-toast-icon {
      width: 8px;
      height: 8px;
      margin-top: 6px;
      border-radius: 999px;
      background: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
    }
    #gha-toast.gha-toast .gha-toast-message {
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
      max-height: 360px;
      overflow-y: auto;
    }
    #gha-toast.gha-toast .gha-toast-close {
      width: 22px;
      height: 22px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 16px;
      line-height: 20px;
      padding: 0;
    }
    #gha-toast.gha-toast .gha-toast-close:hover {
      background: var(--btn-hover);
      color: var(--text);
    }
    #gha-toast.gha-toast.ok {
      border-left-color: var(--green);
    }
    #gha-toast.gha-toast.ok .gha-toast-icon {
      background: var(--green);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 18%, transparent);
    }
    #gha-toast.gha-toast.error {
      background: var(--bg2);
      color: var(--red);
      border-color: var(--border);
      border-left-color: var(--red);
    }
    #gha-toast.gha-toast.error .gha-toast-icon {
      background: var(--red);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--red) 18%, transparent);
    }
  `);

  // Theme management
  function getTheme() { return GM_getValue('gha_theme', 'dark'); }
  function setTheme(t) { GM_setValue('gha_theme', t); applyTheme(t); }
  function applyTheme(t) {
    const panel = document.getElementById('gha-panel');
    if (panel) panel.setAttribute('data-theme', t);
    const toastBox = document.getElementById('gha-toast');
    if (toastBox) toastBox.setAttribute('data-theme', t);
  }
  function toggleTheme() {
    const newTheme = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    const btn = document.getElementById('gha-btn-theme');
    if (btn) btn.textContent = newTheme === 'dark' ? '☀' : '☾';
    toast('已切换到' + (newTheme === 'dark' ? '深色' : '亮色') + '主题');
  }

  // ===================== DOM UTILS =====================

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') e.className = v;
        else if (k === 'innerHTML') e.innerHTML = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (typeof v === 'boolean') {
          if (v) e.setAttribute(k, '');
        }
        else if (v != null) e.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    }
    return e;
  }

  // ===================== TOAST =====================

  let toastTimer;
  function toast(msg, isError) {
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
        clearTimeout(toastTimer);
        t.classList.remove('show');
      },
    }, '×'));

    requestAnimationFrame(() => { t.classList.add('show'); });
    clearTimeout(toastTimer);
    if (!sticky) {
      const timeout = isError ? 18000 : (text.startsWith('已复制') ? 5000 : 9000);
      toastTimer = setTimeout(() => { t.classList.remove('show'); }, timeout);
    }
  }

  // ===================== CLIPROXYAPI OAUTH =====================

  function gmFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: opts.method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
        data: opts.body ? JSON.stringify(opts.body) : undefined,
        timeout: opts.timeout || 30000,
        onload(r) {
          try {
            const data = JSON.parse(r.responseText);
            if (r.status >= 200 && r.status < 300) resolve(data);
            else reject(new Error(data.error || data.message || 'HTTP ' + r.status));
          } catch (e) {
            if (r.status >= 200 && r.status < 300) resolve(r.responseText);
            else reject(new Error('HTTP ' + r.status + ': ' + r.responseText));
          }
        },
        onerror() { reject(new Error('Network error')); },
        ontimeout() { reject(new Error('Request timeout')); },
      });
    });
  }

  const cliproxyapi = {
    _base() { return cfg('CLIPROXYAPI_BASE').replace(/\/+$/, ''); },
    _managementKey() { return String(cfg('CLIPROXYAPI_MANAGEMENT_KEY') || '').trim(); },
    async _managementRequest(method, path, body) {
      const key = this._managementKey();
      if (!key) throw new Error('请先填写 CLIProxyAPI 管理密钥');
      return gmFetch(this._base() + '/v0/management' + path, {
        method,
        body,
        headers: {
          'Authorization': 'Bearer ' + key,
          'X-Management-Key': key,
        },
      });
    },
    async getOAuthUrl() { return this._managementRequest('GET', '/codex-auth-url?is_webui=true'); },
    async getOAuthStatus(state) {
      if (!state) throw new Error('缺少 OAuth state');
      return this._managementRequest('GET', '/get-auth-status?state=' + encodeURIComponent(state));
    },
    async listAuthFiles() { return this._managementRequest('GET', '/auth-files'); },
  };

  function isNotFoundError(error) {
    return error && /(?:^|\s)HTTP\s+404(?:\D|$)/i.test(error.message || '');
  }

  function isManagementAuthError(error) {
    return error && /missing\s+management\s+key|invalid\s+management\s+key|unauthorized|forbidden|HTTP\s+401|HTTP\s+403/i.test(error.message || '');
  }

  function codexAuthFromFiles(payload) {
    const files = Array.isArray(payload) ? payload :
      (payload && Array.isArray(payload.files) ? payload.files :
        (payload && Array.isArray(payload.auth_files) ? payload.auth_files :
          (payload && Array.isArray(payload.data) ? payload.data : [])));
    return files.find((f) => {
      const haystack = [f.type, f.provider, f.name, f.filename, f.email, f.account_type, f.account].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes('codex');
    }) || null;
  }

  async function testCLIProxyAPIConfig() {
    const base = cfg('CLIPROXYAPI_BASE');
    if (!base) throw new Error('请先填写 CLIProxyAPI 地址');
    try { new URL(base); } catch (_) { throw new Error('CLIProxyAPI 地址不是有效 URL'); }

    try {
      const authFiles = await cliproxyapi.listAuthFiles();
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

  // ===================== OAUTH FLOW =====================

  let oauthPopup = null;

  function oauthStatusIsDone(status) {
    if (!status || typeof status !== 'object') return false;
    const state = String(status.status || status.state || '').toLowerCase();
    return !!(status.active || status.success || status.authenticated || status.is_authenticated ||
      state === 'ok' || state === 'success' || state === 'completed' || state === 'authorized' || state === 'done' ||
      status.email || status.account_email || (status.user && status.user.email));
  }

  function oauthStatusError(status) {
    return status && typeof status === 'object' && String(status.status || '').toLowerCase() === 'error';
  }

  function oauthEmailFrom(value) {
    if (!value || typeof value !== 'object') return '';
    return value.email || value.account_email || value.user_email || (value.user && value.user.email) || '';
  }

  function setOAuthStateFromAuth(value, active) {
    GM_setValue('gha_oauth_active', !!active);
    GM_setValue('gha_oauth_email', active ? oauthEmailFrom(value) : '');
  }

  async function startOAuthFlow() {
    try {
      toast('正在获取授权链接...');
      const res = await cliproxyapi.getOAuthUrl();
      const authUrl = res && (res.url || res.auth_url || res.authUrl);
      const state = res && res.state;
      if (!authUrl) throw new Error('未能获取授权链接');
      if (!state) throw new Error('授权链接缺少 state');
      GM_setValue('gha_oauth_state', state);

      const w = 600, h = 700;
      oauthPopup = window.open(authUrl, 'gha-oauth', `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2}`);
      if (!oauthPopup) {
        toast('弹窗被阻止，正在新标签页打开...');
        GM_openInTab(authUrl, { active: true });
        toast('请在新标签页完成授权后点"检查授权状态"');
        return;
      }
      toast('请在弹窗中完成 OpenAI 授权');
      const checkInterval = setInterval(async () => {
        if (!oauthPopup || oauthPopup.closed) {
          clearInterval(checkInterval);
          oauthPopup = null;
          await completeOAuthFlow(state);
          return;
        }
        try {
          const status = await cliproxyapi.getOAuthStatus(state);
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
      setTimeout(() => { clearInterval(checkInterval); if (oauthPopup && !oauthPopup.closed) oauthPopup.close(); }, 300000);
    } catch (e) { toast('授权失败: ' + e.message, true); }
  }

  async function completeOAuthFlow(state) {
    try {
      const status = await cliproxyapi.getOAuthStatus(state);
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
      const s2 = await cliproxyapi.getOAuthStatus(state);
      if (oauthStatusIsDone(s2)) {
        setOAuthStateFromAuth(s2, true);
        toast('授权成功！');
        updateUI();
        return;
      }
    } catch (_) { }
    toast('授权可能未完成，请重试', true);
  }

  async function checkOAuthStatus() {
    try {
      const authFiles = await cliproxyapi.listAuthFiles();
      const codexAuth = codexAuthFromFiles(authFiles);
      if (codexAuth) {
        setOAuthStateFromAuth(codexAuth, true);
        toast('授权状态: 有效');
      } else {
        setOAuthStateFromAuth(null, false);
        toast('授权状态: 未授权或已过期');
      }
      updateUI();
    } catch (e) { toast('检查授权状态失败: ' + e.message, true); }
  }

  function revokeOAuth() {
    GM_setValue('gha_oauth_active', false);
    GM_setValue('gha_oauth_email', '');
    toast('已清除本地授权状态');
    updateUI();
  }

  // ===================== COPY =====================

  function copyValue(text) {
    GM_setClipboard(String(text), 'text');
    toast('已复制: ' + String(text).substring(0, 50));
  }

  // ===================== UI =====================

  let selectedAccount = null;
  let settingsVisible = false;
  let operationBusy = false;

  function buildPanel() {
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

  function makeDraggable(panel, handle) {
    let ox, oy, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      panel.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - panel.offsetWidth)) + 'px';
      panel.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - panel.offsetHeight)) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; panel.style.transition = ''; });
  }

  function toggleCollapse() {
    const panel = $('#gha-panel');
    const btn = $('#gha-btn-collapse');
    if (!panel || !btn) return;
    btn.textContent = panel.classList.toggle('gha-collapsed') ? '▲' : '▼';
  }

  function toggleSettings() { settingsVisible = !settingsVisible; updateUI(); }

  function saveSettingsForm() {
    setCfg('CLIPROXYAPI_BASE', ($('#gha-cfg-cliproxy')?.value || '').trim().replace(/\/+$/, '') || DEFAULTS.CLIPROXYAPI_BASE);
    setCfg('CLIPROXYAPI_MANAGEMENT_KEY', $('#gha-cfg-cliproxy-management-key')?.value || '');
    setCfg('CLOUDMAIL_BASE', ($('#gha-cfg-cm-base')?.value || '').trim().replace(/\/+$/, '') || DEFAULTS.CLOUDMAIL_BASE);
    setCfg('CLOUDMAIL_LOGIN', ($('#gha-cfg-cm-login')?.value || '').trim());
    setCfg('CLOUDMAIL_PASSWORD', $('#gha-cfg-cm-pass')?.value || '');
    setCfg('CLOUDMAIL_DOMAIN', ($('#gha-cfg-cm-domain')?.value || '').trim() || DEFAULTS.CLOUDMAIL_DOMAIN);
    setCfg('CLOUDMAIL_POLL_INTERVAL', parseInt($('#gha-cfg-cm-interval')?.value, 10) || 5);
    setCfg('CLOUDMAIL_POLL_TIMEOUT', parseInt($('#gha-cfg-cm-timeout')?.value, 10) || 600);
  }

  async function runConfigTest(kind, button) {
    if (button) button.disabled = true;
    try {
      saveSettingsForm();
      toast(kind === 'cliproxyapi' ? '正在测试 CLIProxyAPI...' : '正在测试 CloudMail...');
      const result = kind === 'cliproxyapi' ? await testCLIProxyAPIConfig() : await testCloudMailConfig();
      toast(result.message);
      updateUI();
    } catch (e) {
      toast('测试失败: ' + e.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function updateUI() {
    const body = $('#gha-body');
    if (!body) return;
    body.innerHTML = '';

    // --- Status ---
    const status = getStatus();
    const oauthActive = GM_getValue('gha_oauth_active', false);
    const oauthEmail = GM_getValue('gha_oauth_email', '');

    body.appendChild(el('div', { className: 'gha-status' },
      el('span', { className: 'gha-badge ok' }, `账号: ${status.history_count}`),
      el('span', { className: 'gha-badge ok' }, `地址池: ${status.address_count}`),
      el('span', { className: 'gha-badge ' + (status.config_exists ? 'ok' : 'warn') }, status.config_exists ? 'CloudMail OK' : '未配 CloudMail'),
      el('span', {
        className: 'gha-badge ' + (oauthActive ? 'ok' : 'warn'),
        style: 'cursor:pointer;', onclick: checkOAuthStatus,
        title: oauthEmail || '点击检查',
      }, oauthActive ? `Codex: ${oauthEmail}` : 'Codex: 未授权'),
    ));

    // --- Settings ---
    if (settingsVisible) {
      const s = el('div', { className: 'gha-settings' },
        el('label', {}, 'CLIProxyAPI 地址'), el('input', { id: 'gha-cfg-cliproxy', value: cfg('CLIPROXYAPI_BASE') }),
        el('label', {}, 'CLIProxyAPI 管理密钥'), el('input', { id: 'gha-cfg-cliproxy-management-key', type: 'password', value: cfg('CLIPROXYAPI_MANAGEMENT_KEY') }),
        el('label', {}, 'CloudMail 地址'), el('input', { id: 'gha-cfg-cm-base', value: cfg('CLOUDMAIL_BASE') }),
        el('label', {}, 'CloudMail 登录邮箱'), el('input', { id: 'gha-cfg-cm-login', value: cfg('CLOUDMAIL_LOGIN') }),
        el('label', {}, 'CloudMail 密码'), el('input', { id: 'gha-cfg-cm-pass', type: 'password', value: cfg('CLOUDMAIL_PASSWORD') }),
        el('label', {}, '邮箱域名'), el('input', { id: 'gha-cfg-cm-domain', value: cfg('CLOUDMAIL_DOMAIN'), placeholder: '@example.com' }),
        el('label', {}, '轮询间隔 (秒)'), el('input', { id: 'gha-cfg-cm-interval', type: 'number', value: String(cfg('CLOUDMAIL_POLL_INTERVAL')) }),
        el('label', {}, '轮询超时 (秒)'), el('input', { id: 'gha-cfg-cm-timeout', type: 'number', value: String(cfg('CLOUDMAIL_POLL_TIMEOUT')) }),
        el('div', { className: 'gha-actions' },
          el('button', { className: 'gha-btn-secondary', onclick(e) { runConfigTest('cliproxyapi', e.currentTarget); } }, '测试 CLIProxyAPI'),
          el('button', { className: 'gha-btn-secondary', onclick(e) { runConfigTest('cloudmail', e.currentTarget); } }, '测试 CloudMail'),
        ),
        el('button', {
          className: 'gha-btn-primary', onclick() {
            saveSettingsForm();
            toast('配置已保存'); settingsVisible = false; updateUI();
          }
        }, '保存配置'),
        el('button', {
          className: 'gha-btn-secondary', onclick() {
            if (confirm('确定要清空本地所有账号数据？')) { GM_setValue('gha_accounts', '[]'); toast('已清空'); updateUI(); }
          }
        }, '清空账号数据'),
        el('button', {
          className: 'gha-btn-secondary', onclick() {
            if (confirm('确定要清空地址缓存？（下次将从 OneMap 重新获取）')) { GM_setValue('gha_address_cache', '[]'); GM_setValue('gha_used_addresses', '[]'); toast('已清空'); updateUI(); }
          }
        }, '清空地址缓存'),
        el('button', {
          className: 'gha-btn-secondary', onclick: async () => {
            toast('正在刷新地址池...');
            try {
              const addrs = await fetchAllAddresses('');
              saveAddressCache(addrs);
              toast(`已刷新: ${addrs.length} 个地址`);
              updateUI();
            } catch (e) { toast('刷新失败: ' + e.message, true); }
          }
        }, '刷新地址池 (OneMap)'),
        el('label', { style: 'margin-top:6px;' }, '导入数据（粘贴 JSON 数组或 JSONL）'),
        el('textarea', { id: 'gha-import-data', rows: '4', style: 'background:var(--input-bg);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:4px;font-size:11px;resize:vertical;width:100%;box-sizing:border-box;font-family:monospace;', placeholder: '粘贴 JSON 数据...' }),
        el('button', {
          className: 'gha-btn-secondary', onclick() {
            const raw = document.getElementById('gha-import-data').value.trim();
            if (!raw) { toast('请先粘贴数据', true); return; }
            try {
              let records;
              // Try JSON array first
              if (raw.startsWith('[')) {
                records = JSON.parse(raw);
              } else {
                // JSONL: one JSON object per line
                records = raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
              }
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
              document.getElementById('gha-import-data').value = '';
              toast(`已导入 ${added} 条记录（共 ${records.length} 条，跳过 ${records.length - added} 条重复）`);
              settingsVisible = false;
              updateUI();
            } catch (e) { toast('导入失败: ' + e.message, true); }
          }
        }, '导入数据'),
      );
      body.appendChild(s);
    }

    // --- Actions ---
    const busy = operationBusy;
    body.appendChild(el('div', { className: 'gha-actions' },
      el('button', { className: 'gha-btn-primary', disabled: busy, onclick() { doGenerate(false); } }, '生成新身份'),
      el('button', { className: 'gha-btn-primary', disabled: busy, style: 'background:#a6e3a1;', onclick() { doGenerate(true); } }, '生成 + 验证码'),
      el('button', { className: 'gha-btn-secondary', onclick() { selectedAccount = null; updateUI(); } }, '刷新'),
    ));

    // --- OAuth ---
    const oaActions = el('div', { className: 'gha-actions' });
    if (!oauthActive) {
      oaActions.appendChild(el('button', { className: 'gha-btn-secondary', style: 'border-color:#f9e2af;color:#f9e2af;', onclick: startOAuthFlow }, 'Codex OAuth 授权'));
    }
    oaActions.appendChild(el('button', { className: 'gha-btn-small', onclick: checkOAuthStatus }, '检查授权'));
    if (oauthActive) {
      oaActions.appendChild(el('button', { className: 'gha-btn-small', style: 'color:#f38ba8;', onclick: revokeOAuth }, '清除授权'));
    }
    body.appendChild(oaActions);

    // --- Account list ---
    body.appendChild(el('div', { className: 'gha-section-title' }, '账号列表'));
    const listContainer = el('div', { className: 'gha-account-list' });
    const accounts = loadAccounts();
    if (accounts.length > 0) {
      const reversed = [...accounts].reverse();
      for (const acct of reversed) {
        listContainer.appendChild(el('div', {
          className: 'gha-account-item' + (selectedAccount && selectedAccount.label === acct.label ? ' active' : ''),
          onclick() { selectedAccount = acct; updateUI(); },
        },
          el('span', { className: 'gha-acct-label' }, acct.label),
          el('span', { className: 'gha-acct-name' }, acct.name || '(no name)'),
          acct.verification_code ? el('button', {
            className: 'gha-acct-code',
            type: 'button',
            title: '复制验证码',
            onclick(e) { e.stopPropagation(); copyValue(acct.verification_code); },
          }, acct.verification_code) : null,
        ));
      }
    } else {
      listContainer.appendChild(el('div', { style: 'padding:12px;text-align:center;color:#6c7086;' }, '暂无账号 — 点击"生成新身份"'));
    }
    body.appendChild(listContainer);

    // --- Detail ---
    if (selectedAccount) renderDetail(body);
  }

  function renderDetail(body) {
    const a = selectedAccount;
    const detail = el('div', { className: 'gha-detail' });
    const fields = [
      ['Label', a.label], ['姓名', a.name], ['年龄', a.age], ['生日', a.birthday],
      ['地址', a.address], ['邮编', a.postal_code], ['邮箱', a.email],
      ['验证码', a.verification_code], ['验证时间', a.verification_time], ['创建时间', a.created_at],
    ];
    for (const [label, value] of fields) {
      if (value == null || value === '') continue;
      detail.appendChild(el('div', { className: 'gha-detail-row' },
        el('span', { className: 'gha-detail-label' }, label),
        el('span', { className: 'gha-detail-value' }, String(value)),
        el('button', { className: 'gha-btn-small', onclick() { copyValue(String(value)); } }, '复制'),
      ));
    }
    detail.appendChild(el('div', { className: 'gha-actions', style: 'margin-top:4px;' },
      el('button', { className: 'gha-btn-secondary', onclick() { doChangeEmail(a.label); } }, '更换邮箱'),
      el('button', { className: 'gha-btn-secondary', onclick() { doPoll(a.label); } }, '轮询验证码'),
      el('button', { className: 'gha-btn-secondary', onclick() { doPollLatest(a.label); } }, '快速查码'),
      a.verification_code ? el('button', { className: 'gha-btn-secondary', onclick() { copyValue(a.verification_code); } }, '复制验证码') : null,
      el('button', {
        className: 'gha-btn-secondary', onclick() {
          const a2 = selectedAccount;
          if (!a2) return;
          copyValue(['Label: ' + a2.label, 'Name: ' + a2.name, 'Age: ' + a2.age, 'Birthday: ' + a2.birthday,
          'Address: ' + a2.address, 'Postal Code: ' + a2.postal_code, 'Email: ' + a2.email,
          a2.verification_code ? 'Code: ' + a2.verification_code : ''].filter(Boolean).join('\n'));
        }
      }, '复制全部'),
    ));
    body.appendChild(detail);
  }

  // ===================== ACTIONS =====================

  async function doGenerate(waitVerification) {
    if (operationBusy) return;
    operationBusy = true;
    updateUI();
    try {
      toast('正在生成新身份' + (waitVerification ? '（等待验证码，可能较久）...' : '...'));
      const result = await generateIdentity(waitVerification);
      selectedAccount = result.record;
      toast('生成成功: ' + result.record.name + (result.verification_status === 'received' ? ' | 验证码: ' + result.record.verification_code : ''));
    } catch (e) {
      toast('生成失败: ' + e.message, true);
    } finally {
      operationBusy = false;
      updateUI();
    }
  }

  async function doChangeEmail(label) {
    if (operationBusy) return;
    operationBusy = true;
    updateUI();
    try {
      toast('正在更换邮箱...');
      const result = await changeEmail(label);
      selectedAccount = result.record;
      toast('邮箱更换完成: ' + result.record.email);
    } catch (e) {
      toast('更换失败: ' + e.message, true);
    } finally {
      operationBusy = false;
      updateUI();
    }
  }

  async function doPoll(label) {
    if (operationBusy) return;
    operationBusy = true;
    updateUI();
    try {
      toast('正在轮询验证码...');
      const result = await pollVerification(label);
      if (result.record) selectedAccount = result.record;
      toast(result.record.verification_code ? '验证码: ' + result.record.verification_code : '未收到验证码');
    } catch (e) {
      toast('轮询失败: ' + e.message, true);
    } finally {
      operationBusy = false;
      updateUI();
    }
  }

  async function doPollLatest(label) {
    try {
      toast('正在查询...');
      const result = await pollLatest(label);
      if (result.record) selectedAccount = result.record;
      toast(result.found ? '验证码: ' + result.record.verification_code : '暂无新验证码');
      updateUI();
    } catch (e) {
      toast('查询失败: ' + e.message, true);
    }
  }

  // ===================== INIT =====================

  function init() {
    GM_setValue('gha_busy', false);
    operationBusy = false;
    buildPanel();
    applyTheme(getTheme());
    updateUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
