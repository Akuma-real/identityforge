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

"use strict";
(() => {
  // src/config.ts
  var DEFAULTS = {
    CLIPROXYAPI_BASE: "https://api.example.com",
    CLIPROXYAPI_MANAGEMENT_KEY: "",
    CLOUDMAIL_BASE: "https://mail.example.com",
    CLOUDMAIL_LOGIN: "",
    CLOUDMAIL_PASSWORD: "",
    CLOUDMAIL_DOMAIN: "@example.com",
    CLOUDMAIL_POLL_INTERVAL: 5,
    CLOUDMAIL_POLL_TIMEOUT: 600
  };
  function cfg(key) {
    return GM_getValue("gha_" + key, DEFAULTS[key]);
  }
  function setCfg(key, val) {
    GM_setValue("gha_" + key, val);
  }

  // src/clients/http.ts
  function gmFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: opts.method || "GET",
        headers: Object.assign({ "Content-Type": "application/json" }, opts.headers || {}),
        data: opts.body ? JSON.stringify(opts.body) : void 0,
        timeout: opts.timeout || 3e4,
        onload(r) {
          try {
            const data = JSON.parse(r.responseText);
            if (r.status >= 200 && r.status < 300) resolve(data);
            else reject(new Error(data.error || data.message || "HTTP " + r.status));
          } catch (_) {
            if (r.status >= 200 && r.status < 300) resolve(r.responseText);
            else reject(new Error("HTTP " + r.status + ": " + r.responseText));
          }
        },
        onerror() {
          reject(new Error("Network error"));
        },
        ontimeout() {
          reject(new Error("Request timeout"));
        }
      });
    });
  }

  // src/clients/cliproxyapi.ts
  function base() {
    return cfg("CLIPROXYAPI_BASE").replace(/\/+$/, "");
  }
  function managementKey() {
    return String(cfg("CLIPROXYAPI_MANAGEMENT_KEY") || "").trim();
  }
  function managementRequest(method, path, body) {
    const key = managementKey();
    if (!key) throw new Error("\u8BF7\u5148\u586B\u5199 CLIProxyAPI \u7BA1\u7406\u5BC6\u94A5");
    return gmFetch(base() + "/v0/management" + path, {
      method,
      body,
      headers: {
        Authorization: "Bearer " + key,
        "X-Management-Key": key
      }
    });
  }
  function getOAuthUrl() {
    return managementRequest("GET", "/codex-auth-url?is_webui=true");
  }
  function getOAuthStatus(state) {
    if (!state) throw new Error("\u7F3A\u5C11 OAuth state");
    return managementRequest("GET", "/get-auth-status?state=" + encodeURIComponent(state));
  }
  function listAuthFiles() {
    return managementRequest("GET", "/auth-files");
  }
  function isNotFoundError(error) {
    return error instanceof Error && /(?:^|\s)HTTP\s+404(?:\D|$)/i.test(error.message);
  }
  function isManagementAuthError(error) {
    return error instanceof Error && /missing\s+management\s+key|invalid\s+management\s+key|unauthorized|forbidden|HTTP\s+401|HTTP\s+403/i.test(error.message);
  }
  function codexAuthFromFiles(payload) {
    const value = payload;
    const files = Array.isArray(payload) ? payload : Array.isArray(value.files) ? value.files : Array.isArray(value.auth_files) ? value.auth_files : Array.isArray(value.data) ? value.data : [];
    return files.find((f) => {
      const haystack = [f.type, f.provider, f.name, f.filename, f.email, f.account_type, f.account].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes("codex");
    }) || null;
  }
  async function testCLIProxyAPIConfig() {
    const cliproxyBase = cfg("CLIPROXYAPI_BASE");
    if (!cliproxyBase) throw new Error("\u8BF7\u5148\u586B\u5199 CLIProxyAPI \u5730\u5740");
    try {
      new URL(cliproxyBase);
    } catch (_) {
      throw new Error("CLIProxyAPI \u5730\u5740\u4E0D\u662F\u6709\u6548 URL");
    }
    try {
      const authFiles = await listAuthFiles();
      const codexAuth = codexAuthFromFiles(authFiles);
      return {
        ok: true,
        message: codexAuth ? "CLIProxyAPI \u7BA1\u7406\u63A5\u53E3\u53EF\u7528\uFF1B\u5DF2\u53D1\u73B0 Codex \u6388\u6743\u6587\u4EF6" : "CLIProxyAPI \u7BA1\u7406\u63A5\u53E3\u53EF\u7528\uFF1B\u6682\u672A\u53D1\u73B0 Codex \u6388\u6743\u6587\u4EF6"
      };
    } catch (e) {
      if (isNotFoundError(e)) throw new Error("\u672A\u627E\u5230 CLIProxyAPI \u7BA1\u7406\u63A5\u53E3\uFF1B\u8BF7\u786E\u8BA4\u5730\u5740\u6307\u5411\u6700\u65B0\u670D\u52A1\u5E76\u5DF2\u542F\u7528\u7BA1\u7406 API");
      if (isManagementAuthError(e)) throw new Error("CLIProxyAPI \u7BA1\u7406\u5BC6\u94A5\u65E0\u6548\u6216\u8FDC\u7A0B\u7BA1\u7406\u672A\u5F00\u542F");
      throw e;
    }
  }

  // src/ui/dom.ts
  function $(sel, ctx = document) {
    return ctx.querySelector(sel);
  }
  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "className") e.className = String(v);
        else if (k === "innerHTML") e.innerHTML = String(v);
        else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
        else if (typeof v === "boolean") {
          if (v) e.setAttribute(k, "");
        } else if (v != null) e.setAttribute(k, String(v));
      }
    }
    for (const c of children) {
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    }
    return e;
  }

  // src/ui/theme.ts
  function getTheme() {
    return GM_getValue("gha_theme", "dark");
  }
  function setTheme(t) {
    GM_setValue("gha_theme", t);
    applyTheme(t);
  }
  function applyTheme(t) {
    const panel = document.getElementById("gha-panel");
    if (panel) panel.setAttribute("data-theme", t);
    const toastBox = document.getElementById("gha-toast");
    if (toastBox) toastBox.setAttribute("data-theme", t);
  }

  // src/ui/toast.ts
  var toastTimer;
  function toast(msg, isError) {
    let t = document.getElementById("gha-toast");
    if (!t) {
      t = el("div", { id: "gha-toast", className: "gha-toast", role: "status" });
    }
    t.setAttribute("data-theme", getTheme());
    if (t.parentElement !== document.body) document.body.appendChild(t);
    const text = String(msg);
    const sticky = /^正在|请在|授权可能/.test(text);
    t.innerHTML = "";
    t.setAttribute("role", isError ? "alert" : "status");
    t.setAttribute("aria-live", isError ? "assertive" : "polite");
    t.className = "gha-toast" + (isError ? " error" : sticky ? "" : " ok");
    t.appendChild(el("span", { className: "gha-toast-icon", "aria-hidden": "true" }));
    t.appendChild(el("div", { className: "gha-toast-message" }, text));
    t.appendChild(el("button", {
      className: "gha-toast-close",
      type: "button",
      title: "\u5173\u95ED\u63D0\u793A",
      onclick() {
        if (toastTimer) clearTimeout(toastTimer);
        t.classList.remove("show");
      }
    }, "\xD7"));
    requestAnimationFrame(() => {
      t.classList.add("show");
    });
    if (toastTimer) clearTimeout(toastTimer);
    if (!sticky) {
      const timeout = isError ? 18e3 : text.startsWith("\u5DF2\u590D\u5236") ? 5e3 : 9e3;
      toastTimer = window.setTimeout(() => {
        t.classList.remove("show");
      }, timeout);
    }
  }

  // src/ui/oauth.ts
  var oauthPopup = null;
  function oauthStatusIsDone(status) {
    if (!status || typeof status !== "object") return false;
    const value = status;
    const state = String(value.status || value.state || "").toLowerCase();
    return !!(value.active || value.success || value.authenticated || value.is_authenticated || state === "ok" || state === "success" || state === "completed" || state === "authorized" || state === "done" || value.email || value.account_email || value.user && value.user.email);
  }
  function oauthStatusError(status) {
    return status && typeof status === "object" && String(status.status || "").toLowerCase() === "error";
  }
  function oauthEmailFrom(value) {
    if (!value || typeof value !== "object") return "";
    const maybeStatus = value;
    return maybeStatus.email || maybeStatus.account_email || maybeStatus.user_email || maybeStatus.user && maybeStatus.user.email || "";
  }
  function setOAuthStateFromAuth(value, active) {
    GM_setValue("gha_oauth_active", !!active);
    GM_setValue("gha_oauth_email", active ? oauthEmailFrom(value) : "");
  }
  async function startOAuthFlow(updateUI2) {
    try {
      toast("\u6B63\u5728\u83B7\u53D6\u6388\u6743\u94FE\u63A5...");
      const res = await getOAuthUrl();
      const authUrl = res && (res.url || res.auth_url || res.authUrl);
      const state = res && res.state;
      if (!authUrl) throw new Error("\u672A\u80FD\u83B7\u53D6\u6388\u6743\u94FE\u63A5");
      if (!state) throw new Error("\u6388\u6743\u94FE\u63A5\u7F3A\u5C11 state");
      GM_setValue("gha_oauth_state", state);
      const w = 600;
      const h = 700;
      oauthPopup = window.open(authUrl, "gha-oauth", `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2}`);
      if (!oauthPopup) {
        toast("\u5F39\u7A97\u88AB\u963B\u6B62\uFF0C\u6B63\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00...");
        GM_openInTab(authUrl, { active: true });
        toast('\u8BF7\u5728\u65B0\u6807\u7B7E\u9875\u5B8C\u6210\u6388\u6743\u540E\u70B9"\u68C0\u67E5\u6388\u6743\u72B6\u6001"');
        return;
      }
      toast("\u8BF7\u5728\u5F39\u7A97\u4E2D\u5B8C\u6210 OpenAI \u6388\u6743");
      const checkInterval = window.setInterval(async () => {
        if (!oauthPopup || oauthPopup.closed) {
          clearInterval(checkInterval);
          oauthPopup = null;
          await completeOAuthFlow(state, updateUI2);
          return;
        }
        try {
          const status = await getOAuthStatus(state);
          if (oauthStatusError(status)) {
            clearInterval(checkInterval);
            oauthPopup.close();
            oauthPopup = null;
            toast("\u6388\u6743\u5931\u8D25: " + (status.error || "Authentication failed"), true);
            return;
          }
          if (oauthStatusIsDone(status)) {
            clearInterval(checkInterval);
            oauthPopup.close();
            oauthPopup = null;
            setOAuthStateFromAuth(status, true);
            toast("\u6388\u6743\u6210\u529F\uFF01");
            updateUI2();
          }
        } catch (_) {
        }
      }, 500);
      window.setTimeout(() => {
        clearInterval(checkInterval);
        if (oauthPopup && !oauthPopup.closed) oauthPopup.close();
      }, 3e5);
    } catch (e) {
      toast("\u6388\u6743\u5931\u8D25: " + errorMessage(e), true);
    }
  }
  async function completeOAuthFlow(state, updateUI2) {
    try {
      const status = await getOAuthStatus(state);
      if (oauthStatusError(status)) throw new Error(status.error || "Authentication failed");
      if (oauthStatusIsDone(status)) {
        setOAuthStateFromAuth(status, true);
        toast("\u6388\u6743\u6210\u529F\uFF01");
        updateUI2();
        return;
      }
    } catch (_) {
    }
    try {
      await new Promise((r) => setTimeout(r, 3e3));
      const s2 = await getOAuthStatus(state);
      if (oauthStatusIsDone(s2)) {
        setOAuthStateFromAuth(s2, true);
        toast("\u6388\u6743\u6210\u529F\uFF01");
        updateUI2();
        return;
      }
    } catch (_) {
    }
    toast("\u6388\u6743\u53EF\u80FD\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5", true);
  }
  async function checkOAuthStatus(updateUI2) {
    try {
      const authFiles = await listAuthFiles();
      const codexAuth = codexAuthFromFiles(authFiles);
      if (codexAuth) {
        setOAuthStateFromAuth(codexAuth, true);
        toast("\u6388\u6743\u72B6\u6001: \u6709\u6548");
      } else {
        setOAuthStateFromAuth(null, false);
        toast("\u6388\u6743\u72B6\u6001: \u672A\u6388\u6743\u6216\u5DF2\u8FC7\u671F");
      }
      updateUI2();
    } catch (e) {
      toast("\u68C0\u67E5\u6388\u6743\u72B6\u6001\u5931\u8D25: " + errorMessage(e), true);
    }
  }
  function revokeOAuth(updateUI2) {
    GM_setValue("gha_oauth_active", false);
    GM_setValue("gha_oauth_email", "");
    toast("\u5DF2\u6E05\u9664\u672C\u5730\u6388\u6743\u72B6\u6001");
    updateUI2();
  }
  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  // src/clients/cloudmail.ts
  var cmBase = () => cfg("CLOUDMAIL_BASE").replace(/\/+$/, "");
  async function cmGet(path, token) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = token;
    const resp = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: cmBase() + path,
        method: "GET",
        headers,
        timeout: 15e3,
        onload: (r) => {
          try {
            resolve(JSON.parse(r.responseText));
          } catch (_) {
            reject(new Error("CloudMail parse error"));
          }
        },
        onerror: () => reject(new Error("CloudMail network error")),
        ontimeout: () => reject(new Error("CloudMail timeout"))
      });
    });
    if (resp.code !== 0 && resp.code !== 200) throw new Error("CloudMail API error " + resp.code + ": " + (resp.message || ""));
    return resp.data;
  }
  async function cmPost(path, body, token) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers.Authorization = token;
    const resp = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: cmBase() + path,
        method: "POST",
        headers,
        data: JSON.stringify(body),
        timeout: 15e3,
        onload: (r) => {
          try {
            resolve(JSON.parse(r.responseText));
          } catch (_) {
            reject(new Error("CloudMail parse error"));
          }
        },
        onerror: () => reject(new Error("CloudMail network error")),
        ontimeout: () => reject(new Error("CloudMail timeout"))
      });
    });
    if (resp.code !== 0 && resp.code !== 200) {
      const msg = (resp.message || "").toLowerCase();
      if (msg.includes("addaccountdisabled") || msg.includes("add account disabled") || msg.includes("\u6DFB\u52A0\u8D26\u53F7\u529F\u80FD\u5DF2\u5173\u95ED") || msg.includes("\u6DFB\u52A0\u90AE\u7BB1") && msg.includes("\u5173\u95ED")) {
        throw new Error("CloudMail \u540E\u53F0\u672A\u5F00\u542F\u591A\u90AE\u7BB1/\u6DFB\u52A0\u90AE\u7BB1");
      }
      throw new Error("CloudMail API error " + resp.code + ": " + (resp.message || ""));
    }
    return resp.data;
  }
  async function cmLogin() {
    const email = cfg("CLOUDMAIL_LOGIN");
    const password = cfg("CLOUDMAIL_PASSWORD");
    if (!email || !password) throw new Error("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E CloudMail \u8D26\u53F7\u548C\u5BC6\u7801");
    const data = await cmPost("/api/login", { email, password });
    if (!data || !data.token) throw new Error("CloudMail \u767B\u5F55\u5931\u8D25\uFF1A\u672A\u83B7\u53D6\u5230 token");
    return data.token;
  }
  async function testCloudMailConfig() {
    const email = cfg("CLOUDMAIL_LOGIN");
    const password = cfg("CLOUDMAIL_PASSWORD");
    const domain = cfg("CLOUDMAIL_DOMAIN");
    if (!email || !password) throw new Error("\u8BF7\u5148\u586B\u5199 CloudMail \u767B\u5F55\u90AE\u7BB1\u548C\u5BC6\u7801");
    if (!domain || !/^@[^@\s]+\.[^@\s]+$/.test(domain)) throw new Error("\u90AE\u7BB1\u57DF\u540D\u683C\u5F0F\u5E94\u7C7B\u4F3C @example.com");
    const token = await cmLogin();
    let config = null;
    try {
      config = await getCloudMailWebsiteConfig(token);
    } catch (_) {
      return { ok: true, message: "CloudMail \u767B\u5F55\u6210\u529F\uFF1B\u57FA\u7840\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF0C\u4F46\u767B\u5F55\u914D\u7F6E\u53EF\u7528" };
    }
    if (config && config.addEmail !== void 0 && config.addEmail !== 0) {
      throw new Error("CloudMail \u767B\u5F55\u6210\u529F\uFF0C\u4F46\u540E\u53F0\u672A\u5F00\u542F\u6DFB\u52A0\u90AE\u7BB1\u529F\u80FD");
    }
    const minPrefix = config && config.minEmailPrefix ? `\uFF1B\u6700\u77ED\u90AE\u7BB1\u524D\u7F00 ${config.minEmailPrefix}` : "";
    return { ok: true, message: "CloudMail \u6D4B\u8BD5\u6210\u529F" + minPrefix };
  }
  async function getCloudMailWebsiteConfig(token) {
    return cmGet("/api/setting/websiteConfig", token);
  }
  async function cmCreateAccount(email, token) {
    const data = await cmPost("/api/account/add", { email, token: "" }, token);
    if (!data || !data.accountId) throw new Error("\u521B\u5EFA\u90AE\u7BB1\u8D26\u53F7\u5931\u8D25");
    return { accountId: data.accountId, email: data.email, allReceive: data.allReceive || 0 };
  }
  async function cmLatestEmails(accountId, allReceive, lastSeen, token) {
    const path = "/api/email/latest?emailId=" + lastSeen + "&accountId=" + accountId + "&allReceive=" + allReceive;
    const data = await cmGet(path, token);
    return Array.isArray(data) ? data : [];
  }

  // src/clients/onemap.ts
  var ONEMAP_URL = "https://www.onemap.gov.sg/api/common/elastic/search";
  var NON_RESIDENTIAL = [
    "MRT",
    "BUS INTERCHANGE",
    "MARKET",
    "SCHOOL",
    "PARK",
    "MALL",
    "LIBRARY",
    "POLICE",
    "HOSPITAL",
    "CLINIC",
    "TEMPLE",
    "CHURCH",
    "MOSQUE",
    "HOTEL",
    "COMMUNITY CLUB",
    "HAWKER",
    "FOOD CENTRE",
    "STADIUM",
    "DEPOT"
  ];
  var QUERY_SEEDS = [
    "ANG MO KIO",
    "BEDOK",
    "TAMPINES",
    "WOODLANDS",
    "YISHUN",
    "JURONG WEST",
    "HOUGANG",
    "SENGKANG",
    "PUNGGOL",
    "CLEMENTI",
    "QUEENSTOWN",
    "TOA PAYOH"
  ];
  function displayAddress(full) {
    let trimmed = full.trim();
    if (!trimmed) return "";
    let parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const secondLast = parts[parts.length - 2];
      if (/^\d{6}$/.test(last) && secondLast.toUpperCase() === "SINGAPORE") {
        parts = parts.slice(0, -2);
      }
    }
    return parts.join(" ");
  }
  function normalizeAddress(result) {
    const block = (result.BLK_NO || "").trim();
    const road = (result.ROAD_NAME || "").trim();
    const postal = (result.POSTAL || "").trim();
    const address = (result.ADDRESS || "").trim();
    const building = (result.BUILDING || "").trim();
    const searchVal = (result.SEARCHVAL || "").trim();
    if (!block || !road || !address) return null;
    if (!/^\d{6}$/.test(postal)) return null;
    if (!/^[0-9]{1,4}[A-Z]?$/i.test(block)) return null;
    const source = [searchVal, building, address, block, road].join(" ").toUpperCase();
    for (const term of NON_RESIDENTIAL) {
      if (source.includes(term)) return null;
    }
    const roadUpper = road.toUpperCase();
    const full = displayAddress(block + " " + roadUpper + " SINGAPORE " + postal);
    return { block, road: roadUpper, postal_code: postal, full };
  }
  async function fetchOneMapPage(searchVal, pageNum, token) {
    const params = new URLSearchParams({ searchVal, returnGeom: "N", getAddrDetails: "Y", pageNum: String(pageNum) });
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: ONEMAP_URL + "?" + params.toString(),
        method: "GET",
        headers,
        timeout: 15e3,
        onload: (r) => {
          try {
            resolve(JSON.parse(r.responseText));
          } catch (_) {
            reject(new Error("OneMap parse error"));
          }
        },
        onerror: () => reject(new Error("OneMap network error")),
        ontimeout: () => reject(new Error("OneMap timeout"))
      });
    });
  }
  async function fetchAllAddresses(token) {
    const all = [];
    for (const seed of QUERY_SEEDS) {
      try {
        const first = await fetchOneMapPage(seed, 1, token);
        if (!first || first.found === 0) continue;
        for (const r of first.results || []) {
          const addr = normalizeAddress(r);
          if (addr) all.push(addr);
        }
        const totalPages = first.totalNumPages || 1;
        for (let page = 2; page <= totalPages; page++) {
          const pg = await fetchOneMapPage(seed, page, token);
          for (const r of pg.results || []) {
            const addr = normalizeAddress(r);
            if (addr) all.push(addr);
          }
        }
      } catch (_) {
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const a of all) {
      if (!seen.has(a.full)) {
        seen.add(a.full);
        unique.push(a);
      }
    }
    unique.sort((a, b) => a.full.localeCompare(b.full));
    return unique;
  }

  // src/storage.ts
  function loadAccounts() {
    try {
      return JSON.parse(GM_getValue("gha_accounts", "[]"));
    } catch (_) {
      return [];
    }
  }
  function saveAccounts(accounts) {
    GM_setValue("gha_accounts", JSON.stringify(accounts));
  }
  function loadAddressCache() {
    try {
      return JSON.parse(GM_getValue("gha_address_cache", "[]"));
    } catch (_) {
      return [];
    }
  }
  function saveAddressCache(arr) {
    GM_setValue("gha_address_cache", JSON.stringify(arr));
  }
  function loadUsedAddresses() {
    try {
      return new Set(JSON.parse(GM_getValue("gha_used_addresses", "[]")));
    } catch (_) {
      return /* @__PURE__ */ new Set();
    }
  }
  function saveUsedAddresses(set) {
    GM_setValue("gha_used_addresses", JSON.stringify([...set].sort()));
  }
  function usedEmailsSet(accounts) {
    const s = /* @__PURE__ */ new Set();
    for (const a of accounts) {
      if (a.email) s.add(a.email.toLowerCase().trim());
    }
    return s;
  }
  function usedNamesSet(accounts) {
    const s = /* @__PURE__ */ new Set();
    for (const a of accounts) {
      if (a.name) s.add(a.name.trim());
    }
    return s;
  }
  function nextAccountLabel(accounts) {
    let max = 0;
    for (const a of accounts) {
      const m = a.label && a.label.match(/^account_(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return "account_" + String(max + 1).padStart(3, "0");
  }
  function getStatus() {
    const accounts = loadAccounts();
    const addressPool = loadAddressCache();
    const usedAddresses = loadUsedAddresses();
    return {
      config_exists: !!(cfg("CLOUDMAIL_LOGIN") && cfg("CLOUDMAIL_PASSWORD")),
      history_count: accounts.length,
      address_count: addressPool.length,
      used_address_count: usedAddresses.size,
      last_account: accounts.length > 0 ? accounts[accounts.length - 1].label : ""
    };
  }

  // src/generator/address.ts
  function pickUnusedAddress(rng, addressPool, usedAddresses) {
    const available = addressPool.filter((a) => !usedAddresses.has(a.full));
    if (available.length === 0) {
      usedAddresses.clear();
      saveUsedAddresses(usedAddresses);
      return addressPool.length ? addressPool[rng.intn(addressPool.length)] : null;
    }
    return available[rng.intn(available.length)];
  }

  // src/generator/birthday.ts
  function randomAge(rng) {
    return 18 + rng.intn(33);
  }
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }
  function randomBirthday(rng, age, now = /* @__PURE__ */ new Date()) {
    const year = now.getFullYear() - age;
    const month = 1 + rng.intn(12);
    const day = 1 + rng.intn(daysInMonth(year, month));
    return String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  // src/generator/email.ts
  var EMAIL_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
  function randomEmailSuffix(rng, n) {
    let s = "";
    for (let i = 0; i < n; i++) s += EMAIL_ALPHABET[rng.intn(36)];
    return s;
  }
  function nameSlug(name) {
    let slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) slug = "user";
    if (slug.length > 32) slug = slug.slice(0, 32).replace(/-+$/, "") || "user";
    return slug;
  }
  function generateUniqueEmail(name, domain, minPrefix, used, rng) {
    domain = domain.trim().toLowerCase();
    if (!domain.startsWith("@")) domain = "@" + domain;
    if (!domain || domain === "@") throw new Error("Invalid email domain");
    if (minPrefix < 1) minPrefix = 1;
    let base2 = "sg-" + nameSlug(name);
    while (base2.length < minPrefix) base2 += "-x";
    for (let i = 0; i < 500; i++) {
      const email = base2 + "-" + randomEmailSuffix(rng, 6) + domain;
      if (!used.has(email)) return email;
    }
    throw new Error("Failed to generate unique email");
  }

  // src/generator/random.ts
  function createRNG(seed) {
    if (!seed) seed = Date.now() ^ Math.random() * 4294967296;
    let s = seed | 0;
    return {
      next() {
        s |= 0;
        s = s + 1831565813 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      },
      intn(n) {
        return Math.floor(this.next() * n);
      }
    };
  }
  function pick(rng, arr) {
    return arr.length ? arr[rng.intn(arr.length)] : void 0;
  }

  // src/generator/name.ts
  var englishGivenNames = [
    "Adrian",
    "Alicia",
    "Brandon",
    "Cheryl",
    "Darren",
    "Evelyn",
    "Felicia",
    "Gerald",
    "Hannah",
    "Isaac",
    "Jasmine",
    "Kenneth",
    "Lydia",
    "Marcus",
    "Nadia",
    "Pravin",
    "Rina",
    "Suresh",
    "Terence",
    "Vanessa",
    "Wei Jie",
    "Xin Yi"
  ];
  var chineseSurnames = [
    "Tan",
    "Lim",
    "Lee",
    "Ng",
    "Ong",
    "Wong",
    "Chua",
    "Koh",
    "Goh",
    "Teo",
    "Yeo",
    "Low"
  ];
  var chineseGivenParts = [
    "Wei",
    "Jun",
    "Ming",
    "Kai",
    "Jie",
    "Hui",
    "Xuan",
    "Yi",
    "Ling",
    "Mei"
  ];
  var malayGivenNames = [
    "Nur",
    "Aisyah",
    "Farhan",
    "Hafiz",
    "Irfan",
    "Siti",
    "Amirah",
    "Hakim",
    "Zul",
    "Danish",
    "Nadia",
    "Rafiq"
  ];
  var malaySurnames = [
    "Rahman",
    "Hassan",
    "Ismail",
    "Yusof",
    "Salleh",
    "Ibrahim",
    "Osman"
  ];
  var indianGivenNames = [
    "Arjun",
    "Priya",
    "Kavitha",
    "Ravi",
    "Anjali",
    "Vikram",
    "Meena",
    "Devan",
    "Lakshmi",
    "Kiran",
    "Nisha",
    "Sanjay"
  ];
  var indianSurnames = [
    "Menon",
    "Pillai",
    "Nair",
    "Rajan",
    "Krishnan",
    "Kumar",
    "Singh"
  ];
  function mustPick(rng, arr) {
    return pick(rng, arr) || "";
  }
  function generateName(rng) {
    switch (rng.intn(4)) {
      case 0:
        return mustPick(rng, englishGivenNames) + " " + mustPick(rng, chineseSurnames);
      case 1:
        return mustPick(rng, chineseSurnames) + " " + mustPick(rng, chineseGivenParts) + " " + mustPick(rng, chineseGivenParts);
      case 2:
        return mustPick(rng, malayGivenNames) + " bin " + mustPick(rng, malaySurnames);
      default:
        return mustPick(rng, indianGivenNames) + " " + mustPick(rng, indianSurnames);
    }
  }
  function uniqueName(rng, usedNames) {
    for (let i = 0; i < 100; i++) {
      const n = generateName(rng);
      if (!usedNames.has(n)) return n;
    }
    for (let i = 100; i < 1e3; i++) {
      const n = generateName(rng) + " " + String(i).padStart(3, "0");
      if (!usedNames.has(n)) return n;
    }
    return generateName(rng) + " " + Date.now();
  }

  // src/utils/time.ts
  function formatTimestampWithOffset(now = /* @__PURE__ */ new Date()) {
    const pad2 = (n) => String(Math.abs(n)).padStart(2, "0");
    const offsetMinutes = -now.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absOffset = Math.abs(offsetMinutes);
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate()) + "T" + pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds()) + sign + pad2(Math.floor(absOffset / 60)) + ":" + pad2(absOffset % 60);
  }

  // src/verification.ts
  function searchableText(value) {
    if (!value) return "";
    return value.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\s+/g, " ").trim();
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
    return "";
  }
  function formatCMTime(value) {
    if (!value) return "";
    try {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (!m) return value;
      const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
      if (isNaN(utc.getTime())) return value;
      const local = new Date(utc.getTime() - utc.getTimezoneOffset() * 6e4);
      const pad = (n) => String(n).padStart(2, "0");
      return local.getFullYear() + "-" + pad(local.getMonth() + 1) + "-" + pad(local.getDate()) + " " + pad(local.getHours()) + ":" + pad(local.getMinutes()) + ":" + pad(local.getSeconds());
    } catch (_) {
      return value;
    }
  }

  // src/services/identity.ts
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  async function ensureAddressPool(notify) {
    let addressPool = loadAddressCache();
    if (addressPool.length === 0) {
      notify?.("\u6B63\u5728\u4ECE OneMap \u83B7\u53D6\u65B0\u52A0\u5761\u5730\u5740...");
      addressPool = await fetchAllAddresses("");
      if (addressPool.length === 0) throw new Error("\u65E0\u6CD5\u83B7\u53D6\u5730\u5740\u6570\u636E");
      saveAddressCache(addressPool);
      notify?.(`\u5DF2\u52A0\u8F7D ${addressPool.length} \u4E2A\u5730\u5740`);
    }
    return addressPool;
  }
  async function resolveMinEmailPrefix(token) {
    let minPrefix = 1;
    try {
      const config = await getCloudMailWebsiteConfig(token);
      if (config && config.minEmailPrefix) minPrefix = config.minEmailPrefix;
      if (config && config.addEmail !== void 0 && config.addEmail !== 0) {
        throw new Error("CloudMail \u540E\u53F0\u672A\u5F00\u542F\u6DFB\u52A0\u90AE\u7BB1\u529F\u80FD");
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("\u672A\u5F00\u542F")) throw e;
    }
    return minPrefix;
  }
  async function generateIdentity(waitVerification, notify) {
    const accounts = loadAccounts();
    const rng = createRNG(0);
    const addressPool = await ensureAddressPool(notify);
    const usedAddresses = loadUsedAddresses();
    const usedNames = usedNamesSet(accounts);
    const name = uniqueName(rng, usedNames);
    const age = randomAge(rng);
    const birthday = randomBirthday(rng, age);
    const addr = pickUnusedAddress(rng, addressPool, usedAddresses);
    if (!addr) throw new Error("\u5730\u5740\u6C60\u5DF2\u8017\u5C3D");
    notify?.("\u6B63\u5728\u767B\u5F55 CloudMail \u5E76\u521B\u5EFA\u90AE\u7BB1...");
    const token = await cmLogin();
    const domain = cfg("CLOUDMAIL_DOMAIN");
    const usedEmails = usedEmailsSet(accounts);
    const minPrefix = await resolveMinEmailPrefix(token);
    const emailAddr = generateUniqueEmail(name, domain, minPrefix, usedEmails, rng);
    const cmAccount = await cmCreateAccount(emailAddr, token);
    const created = formatTimestampWithOffset();
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
      verification_code: "",
      verification_time: "",
      created_at: created,
      updated_at: created
    };
    let verificationStatus = "not_requested";
    if (waitVerification) {
      notify?.("\u6B63\u5728\u8F6E\u8BE2\u9A8C\u8BC1\u7801...");
      const interval = Number(cfg("CLOUDMAIL_POLL_INTERVAL")) * 1e3;
      const timeout = Number(cfg("CLOUDMAIL_POLL_TIMEOUT")) * 1e3;
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
            verificationStatus = "received";
            break;
          }
        }
        if (verificationStatus === "received") break;
        await sleep(interval);
      }
      if (verificationStatus !== "received") verificationStatus = "timeout_or_error";
    }
    record.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    accounts.push(record);
    saveAccounts(accounts);
    usedAddresses.add(addr.full);
    saveUsedAddresses(usedAddresses);
    return { record, address_pool_count: addressPool.length, used_address_count: usedAddresses.size, verification_status: verificationStatus };
  }
  async function changeEmail(label) {
    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.label === label);
    if (idx === -1) throw new Error("\u8D26\u53F7\u672A\u627E\u5230: " + label);
    const record = accounts[idx];
    const rng = createRNG(0);
    const token = await cmLogin();
    const domain = cfg("CLOUDMAIL_DOMAIN");
    const usedEmails = usedEmailsSet(accounts);
    const usedNames = usedNamesSet(accounts);
    const name = uniqueName(rng, usedNames);
    const age = randomAge(rng);
    const birthday = randomBirthday(rng, age);
    const addressPool = await ensureAddressPool();
    const usedAddresses = loadUsedAddresses();
    const addr = pickUnusedAddress(rng, addressPool, usedAddresses);
    if (!addr) throw new Error("\u5730\u5740\u6C60\u5DF2\u8017\u5C3D");
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
    record.verification_code = "";
    record.verification_time = "";
    record.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    accounts[idx] = record;
    saveAccounts(accounts);
    usedAddresses.add(addr.full);
    saveUsedAddresses(usedAddresses);
    return { record };
  }
  async function pollVerification(label) {
    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.label === label);
    if (idx === -1) throw new Error("\u8D26\u53F7\u672A\u627E\u5230: " + label);
    const record = accounts[idx];
    const token = await cmLogin();
    const interval = Number(cfg("CLOUDMAIL_POLL_INTERVAL")) * 1e3;
    const timeout = Number(cfg("CLOUDMAIL_POLL_TIMEOUT")) * 1e3;
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
          record.updated_at = (/* @__PURE__ */ new Date()).toISOString();
          accounts[idx] = record;
          saveAccounts(accounts);
          return { record };
        }
      }
      await sleep(interval);
    }
    return { record };
  }
  async function pollLatest(label) {
    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.label === label);
    if (idx === -1) throw new Error("\u8D26\u53F7\u672A\u627E\u5230: " + label);
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
        record.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        accounts[idx] = record;
        saveAccounts(accounts);
        found = true;
        break;
      }
    }
    if (!found && newLastSeen > lastSeen) {
      record.latest_email_id = newLastSeen;
      record.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      accounts[idx] = record;
      saveAccounts(accounts);
    }
    return { record, found };
  }

  // src/ui/panel.ts
  var selectedAccount = null;
  var settingsVisible = false;
  var operationBusy = false;
  function buildPanel() {
    const existing = document.getElementById("gha-panel");
    if (existing) existing.remove();
    const existingToast = document.getElementById("gha-toast");
    if (existingToast) existingToast.remove();
    const panel = el("div", { id: "gha-panel" });
    const header = el(
      "div",
      { id: "gha-header" },
      el("span", { className: "gha-title" }, "IdentityForge"),
      el("button", { className: "gha-btn", id: "gha-btn-theme", title: "\u5207\u6362\u4E3B\u9898", onclick: toggleTheme }, getTheme() === "dark" ? "\u2600" : "\u263E"),
      el("button", { className: "gha-btn", id: "gha-btn-settings", title: "\u8BBE\u7F6E", onclick: toggleSettings }, "\u2699"),
      el("button", { className: "gha-btn", id: "gha-btn-collapse", title: "\u6298\u53E0", onclick: toggleCollapse }, "\u25BC")
    );
    panel.appendChild(header);
    panel.appendChild(el("div", { id: "gha-body" }));
    document.body.appendChild(panel);
    makeDraggable(panel, header);
    return panel;
  }
  function makeDraggable(panel, handle) {
    let ox = 0;
    let oy = 0;
    let dragging = false;
    handle.addEventListener("mousedown", (e) => {
      if (e.target instanceof HTMLElement && (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT")) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      panel.style.transition = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - panel.offsetWidth)) + "px";
      panel.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - panel.offsetHeight)) + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
      panel.style.transition = "";
    });
  }
  function toggleCollapse() {
    const panel = $("#gha-panel");
    const btn = $("#gha-btn-collapse");
    if (!panel || !btn) return;
    btn.textContent = panel.classList.toggle("gha-collapsed") ? "\u25B2" : "\u25BC";
  }
  function toggleSettings() {
    settingsVisible = !settingsVisible;
    updateUI();
  }
  function toggleTheme() {
    const newTheme = getTheme() === "dark" ? "light" : "dark";
    setTheme(newTheme);
    const btn = document.getElementById("gha-btn-theme");
    if (btn) btn.textContent = newTheme === "dark" ? "\u2600" : "\u263E";
    toast("\u5DF2\u5207\u6362\u5230" + (newTheme === "dark" ? "\u6DF1\u8272" : "\u4EAE\u8272") + "\u4E3B\u9898");
  }
  function inputValue(id) {
    const input = document.getElementById(id);
    return input?.value || "";
  }
  function saveSettingsForm() {
    setCfg("CLIPROXYAPI_BASE", inputValue("gha-cfg-cliproxy").trim().replace(/\/+$/, "") || DEFAULTS.CLIPROXYAPI_BASE);
    setCfg("CLIPROXYAPI_MANAGEMENT_KEY", inputValue("gha-cfg-cliproxy-management-key"));
    setCfg("CLOUDMAIL_BASE", inputValue("gha-cfg-cm-base").trim().replace(/\/+$/, "") || DEFAULTS.CLOUDMAIL_BASE);
    setCfg("CLOUDMAIL_LOGIN", inputValue("gha-cfg-cm-login").trim());
    setCfg("CLOUDMAIL_PASSWORD", inputValue("gha-cfg-cm-pass"));
    setCfg("CLOUDMAIL_DOMAIN", inputValue("gha-cfg-cm-domain").trim() || DEFAULTS.CLOUDMAIL_DOMAIN);
    setCfg("CLOUDMAIL_POLL_INTERVAL", parseInt(inputValue("gha-cfg-cm-interval"), 10) || 5);
    setCfg("CLOUDMAIL_POLL_TIMEOUT", parseInt(inputValue("gha-cfg-cm-timeout"), 10) || 600);
  }
  async function runConfigTest(kind, button) {
    if (button) button.disabled = true;
    try {
      saveSettingsForm();
      toast(kind === "cliproxyapi" ? "\u6B63\u5728\u6D4B\u8BD5 CLIProxyAPI..." : "\u6B63\u5728\u6D4B\u8BD5 CloudMail...");
      const result = kind === "cliproxyapi" ? await testCLIProxyAPIConfig() : await testCloudMailConfig();
      toast(result.message);
      updateUI();
    } catch (e) {
      toast("\u6D4B\u8BD5\u5931\u8D25: " + errorMessage2(e), true);
    } finally {
      if (button) button.disabled = false;
    }
  }
  function updateUI() {
    const body = $("#gha-body");
    if (!body) return;
    body.innerHTML = "";
    const status = getStatus();
    const oauthActive = GM_getValue("gha_oauth_active", false);
    const oauthEmail = GM_getValue("gha_oauth_email", "");
    body.appendChild(el(
      "div",
      { className: "gha-status" },
      el("span", { className: "gha-badge ok" }, `\u8D26\u53F7: ${status.history_count}`),
      el("span", { className: "gha-badge ok" }, `\u5730\u5740\u6C60: ${status.address_count}`),
      el("span", { className: "gha-badge " + (status.config_exists ? "ok" : "warn") }, status.config_exists ? "CloudMail OK" : "\u672A\u914D CloudMail"),
      el("span", {
        className: "gha-badge " + (oauthActive ? "ok" : "warn"),
        style: "cursor:pointer;",
        onclick: () => checkOAuthStatus(updateUI),
        title: oauthEmail || "\u70B9\u51FB\u68C0\u67E5"
      }, oauthActive ? `Codex: ${oauthEmail}` : "Codex: \u672A\u6388\u6743")
    ));
    if (settingsVisible) {
      body.appendChild(renderSettings());
    }
    const busy = operationBusy;
    body.appendChild(el(
      "div",
      { className: "gha-actions" },
      el("button", { className: "gha-btn-primary", disabled: busy, onclick: () => doGenerate(false) }, "\u751F\u6210\u65B0\u8EAB\u4EFD"),
      el("button", { className: "gha-btn-primary", disabled: busy, style: "background:#a6e3a1;", onclick: () => doGenerate(true) }, "\u751F\u6210 + \u9A8C\u8BC1\u7801"),
      el("button", { className: "gha-btn-secondary", onclick: () => {
        selectedAccount = null;
        updateUI();
      } }, "\u5237\u65B0")
    ));
    const oaActions = el("div", { className: "gha-actions" });
    if (!oauthActive) {
      oaActions.appendChild(el("button", { className: "gha-btn-secondary", style: "border-color:#f9e2af;color:#f9e2af;", onclick: () => startOAuthFlow(updateUI) }, "Codex OAuth \u6388\u6743"));
    }
    oaActions.appendChild(el("button", { className: "gha-btn-small", onclick: () => checkOAuthStatus(updateUI) }, "\u68C0\u67E5\u6388\u6743"));
    if (oauthActive) {
      oaActions.appendChild(el("button", { className: "gha-btn-small", style: "color:#f38ba8;", onclick: () => revokeOAuth(updateUI) }, "\u6E05\u9664\u6388\u6743"));
    }
    body.appendChild(oaActions);
    body.appendChild(el("div", { className: "gha-section-title" }, "\u8D26\u53F7\u5217\u8868"));
    const listContainer = el("div", { className: "gha-account-list" });
    const accounts = loadAccounts();
    if (accounts.length > 0) {
      const reversed = [...accounts].reverse();
      for (const acct of reversed) {
        listContainer.appendChild(el(
          "div",
          {
            className: "gha-account-item" + (selectedAccount && selectedAccount.label === acct.label ? " active" : ""),
            onclick: () => {
              selectedAccount = acct;
              updateUI();
            }
          },
          el("span", { className: "gha-acct-label" }, acct.label),
          el("span", { className: "gha-acct-name" }, acct.name || "(no name)"),
          acct.verification_code ? el("button", {
            className: "gha-acct-code",
            type: "button",
            title: "\u590D\u5236\u9A8C\u8BC1\u7801",
            onclick: (e) => {
              e.stopPropagation();
              copyValue(acct.verification_code);
            }
          }, acct.verification_code) : null
        ));
      }
    } else {
      listContainer.appendChild(el("div", { style: "padding:12px;text-align:center;color:#6c7086;" }, '\u6682\u65E0\u8D26\u53F7 \u2014 \u70B9\u51FB"\u751F\u6210\u65B0\u8EAB\u4EFD"'));
    }
    body.appendChild(listContainer);
    if (selectedAccount) renderDetail(body, selectedAccount);
    applyTheme(getTheme());
  }
  function renderSettings() {
    return el(
      "div",
      { className: "gha-settings" },
      el("label", {}, "CLIProxyAPI \u5730\u5740"),
      el("input", { id: "gha-cfg-cliproxy", value: cfg("CLIPROXYAPI_BASE") }),
      el("label", {}, "CLIProxyAPI \u7BA1\u7406\u5BC6\u94A5"),
      el("input", { id: "gha-cfg-cliproxy-management-key", type: "password", value: cfg("CLIPROXYAPI_MANAGEMENT_KEY") }),
      el("label", {}, "CloudMail \u5730\u5740"),
      el("input", { id: "gha-cfg-cm-base", value: cfg("CLOUDMAIL_BASE") }),
      el("label", {}, "CloudMail \u767B\u5F55\u90AE\u7BB1"),
      el("input", { id: "gha-cfg-cm-login", value: cfg("CLOUDMAIL_LOGIN") }),
      el("label", {}, "CloudMail \u5BC6\u7801"),
      el("input", { id: "gha-cfg-cm-pass", type: "password", value: cfg("CLOUDMAIL_PASSWORD") }),
      el("label", {}, "\u90AE\u7BB1\u57DF\u540D"),
      el("input", { id: "gha-cfg-cm-domain", value: cfg("CLOUDMAIL_DOMAIN"), placeholder: "@example.com" }),
      el("label", {}, "\u8F6E\u8BE2\u95F4\u9694 (\u79D2)"),
      el("input", { id: "gha-cfg-cm-interval", type: "number", value: String(cfg("CLOUDMAIL_POLL_INTERVAL")) }),
      el("label", {}, "\u8F6E\u8BE2\u8D85\u65F6 (\u79D2)"),
      el("input", { id: "gha-cfg-cm-timeout", type: "number", value: String(cfg("CLOUDMAIL_POLL_TIMEOUT")) }),
      el(
        "div",
        { className: "gha-actions" },
        el("button", { className: "gha-btn-secondary", onclick: (e) => runConfigTest("cliproxyapi", e.currentTarget) }, "\u6D4B\u8BD5 CLIProxyAPI"),
        el("button", { className: "gha-btn-secondary", onclick: (e) => runConfigTest("cloudmail", e.currentTarget) }, "\u6D4B\u8BD5 CloudMail")
      ),
      el("button", {
        className: "gha-btn-primary",
        onclick: () => {
          saveSettingsForm();
          toast("\u914D\u7F6E\u5DF2\u4FDD\u5B58");
          settingsVisible = false;
          updateUI();
        }
      }, "\u4FDD\u5B58\u914D\u7F6E"),
      el("button", {
        className: "gha-btn-secondary",
        onclick: () => {
          if (confirm("\u786E\u5B9A\u8981\u6E05\u7A7A\u672C\u5730\u6240\u6709\u8D26\u53F7\u6570\u636E\uFF1F")) {
            GM_setValue("gha_accounts", "[]");
            toast("\u5DF2\u6E05\u7A7A");
            updateUI();
          }
        }
      }, "\u6E05\u7A7A\u8D26\u53F7\u6570\u636E"),
      el("button", {
        className: "gha-btn-secondary",
        onclick: () => {
          if (confirm("\u786E\u5B9A\u8981\u6E05\u7A7A\u5730\u5740\u7F13\u5B58\uFF1F\uFF08\u4E0B\u6B21\u5C06\u4ECE OneMap \u91CD\u65B0\u83B7\u53D6\uFF09")) {
            GM_setValue("gha_address_cache", "[]");
            GM_setValue("gha_used_addresses", "[]");
            toast("\u5DF2\u6E05\u7A7A");
            updateUI();
          }
        }
      }, "\u6E05\u7A7A\u5730\u5740\u7F13\u5B58"),
      el("button", {
        className: "gha-btn-secondary",
        onclick: async () => {
          toast("\u6B63\u5728\u5237\u65B0\u5730\u5740\u6C60...");
          try {
            const addrs = await fetchAllAddresses("");
            saveAddressCache(addrs);
            toast(`\u5DF2\u5237\u65B0: ${addrs.length} \u4E2A\u5730\u5740`);
            updateUI();
          } catch (e) {
            toast("\u5237\u65B0\u5931\u8D25: " + errorMessage2(e), true);
          }
        }
      }, "\u5237\u65B0\u5730\u5740\u6C60 (OneMap)"),
      el("label", { style: "margin-top:6px;" }, "\u5BFC\u5165\u6570\u636E\uFF08\u7C98\u8D34 JSON \u6570\u7EC4\u6216 JSONL\uFF09"),
      el("textarea", { id: "gha-import-data", rows: "4", style: "background:var(--input-bg);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:4px;font-size:11px;resize:vertical;width:100%;box-sizing:border-box;font-family:monospace;", placeholder: "\u7C98\u8D34 JSON \u6570\u636E..." }),
      el("button", {
        className: "gha-btn-secondary",
        onclick: importData
      }, "\u5BFC\u5165\u6570\u636E")
    );
  }
  function importData() {
    const textarea = document.getElementById("gha-import-data");
    const raw = textarea?.value.trim() || "";
    if (!raw) {
      toast("\u8BF7\u5148\u7C98\u8D34\u6570\u636E", true);
      return;
    }
    try {
      const records = raw.startsWith("[") ? JSON.parse(raw) : raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
      if (!Array.isArray(records) || records.length === 0) throw new Error("Invalid format");
      const existing = loadAccounts();
      const merged = [...existing];
      let added = 0;
      for (const r of records) {
        if (!merged.find((a) => a.label === r.label)) {
          merged.push(r);
          added++;
        }
      }
      saveAccounts(merged);
      if (textarea) textarea.value = "";
      toast(`\u5DF2\u5BFC\u5165 ${added} \u6761\u8BB0\u5F55\uFF08\u5171 ${records.length} \u6761\uFF0C\u8DF3\u8FC7 ${records.length - added} \u6761\u91CD\u590D\uFF09`);
      settingsVisible = false;
      updateUI();
    } catch (e) {
      toast("\u5BFC\u5165\u5931\u8D25: " + errorMessage2(e), true);
    }
  }
  function renderDetail(body, a) {
    const detail = el("div", { className: "gha-detail" });
    const fields = [
      ["Label", a.label],
      ["\u59D3\u540D", a.name],
      ["\u5E74\u9F84", a.age],
      ["\u751F\u65E5", a.birthday],
      ["\u5730\u5740", a.address],
      ["\u90AE\u7F16", a.postal_code],
      ["\u90AE\u7BB1", a.email],
      ["\u9A8C\u8BC1\u7801", a.verification_code],
      ["\u9A8C\u8BC1\u65F6\u95F4", a.verification_time],
      ["\u521B\u5EFA\u65F6\u95F4", a.created_at]
    ];
    for (const [label, value] of fields) {
      if (value == null || value === "") continue;
      detail.appendChild(el(
        "div",
        { className: "gha-detail-row" },
        el("span", { className: "gha-detail-label" }, label),
        el("span", { className: "gha-detail-value" }, String(value)),
        el("button", { className: "gha-btn-small", onclick: () => copyValue(String(value)) }, "\u590D\u5236")
      ));
    }
    detail.appendChild(el(
      "div",
      { className: "gha-actions", style: "margin-top:4px;" },
      el("button", { className: "gha-btn-secondary", onclick: () => doChangeEmail(a.label) }, "\u66F4\u6362\u90AE\u7BB1"),
      el("button", { className: "gha-btn-secondary", onclick: () => doPoll(a.label) }, "\u8F6E\u8BE2\u9A8C\u8BC1\u7801"),
      el("button", { className: "gha-btn-secondary", onclick: () => doPollLatest(a.label) }, "\u5FEB\u901F\u67E5\u7801"),
      a.verification_code ? el("button", { className: "gha-btn-secondary", onclick: () => copyValue(a.verification_code) }, "\u590D\u5236\u9A8C\u8BC1\u7801") : null,
      el("button", {
        className: "gha-btn-secondary",
        onclick: () => {
          const a2 = selectedAccount;
          if (!a2) return;
          copyValue([
            "Label: " + a2.label,
            "Name: " + a2.name,
            "Age: " + a2.age,
            "Birthday: " + a2.birthday,
            "Address: " + a2.address,
            "Postal Code: " + a2.postal_code,
            "Email: " + a2.email,
            a2.verification_code ? "Code: " + a2.verification_code : ""
          ].filter(Boolean).join("\n"));
        }
      }, "\u590D\u5236\u5168\u90E8")
    ));
    body.appendChild(detail);
  }
  function copyValue(text) {
    GM_setClipboard(String(text), "text");
    toast("\u5DF2\u590D\u5236: " + String(text).substring(0, 50));
  }
  async function doGenerate(waitVerification) {
    if (operationBusy) return;
    operationBusy = true;
    updateUI();
    try {
      toast("\u6B63\u5728\u751F\u6210\u65B0\u8EAB\u4EFD" + (waitVerification ? "\uFF08\u7B49\u5F85\u9A8C\u8BC1\u7801\uFF0C\u53EF\u80FD\u8F83\u4E45\uFF09..." : "..."));
      const result = await generateIdentity(waitVerification, toast);
      selectedAccount = result.record;
      toast("\u751F\u6210\u6210\u529F: " + result.record.name + (result.verification_status === "received" ? " | \u9A8C\u8BC1\u7801: " + result.record.verification_code : ""));
    } catch (e) {
      toast("\u751F\u6210\u5931\u8D25: " + errorMessage2(e), true);
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
      toast("\u6B63\u5728\u66F4\u6362\u90AE\u7BB1...");
      const result = await changeEmail(label);
      selectedAccount = result.record;
      toast("\u90AE\u7BB1\u66F4\u6362\u5B8C\u6210: " + result.record.email);
    } catch (e) {
      toast("\u66F4\u6362\u5931\u8D25: " + errorMessage2(e), true);
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
      toast("\u6B63\u5728\u8F6E\u8BE2\u9A8C\u8BC1\u7801...");
      const result = await pollVerification(label);
      selectedAccount = result.record;
      toast(result.record.verification_code ? "\u9A8C\u8BC1\u7801: " + result.record.verification_code : "\u672A\u6536\u5230\u9A8C\u8BC1\u7801");
    } catch (e) {
      toast("\u8F6E\u8BE2\u5931\u8D25: " + errorMessage2(e), true);
    } finally {
      operationBusy = false;
      updateUI();
    }
  }
  async function doPollLatest(label) {
    try {
      toast("\u6B63\u5728\u67E5\u8BE2...");
      const result = await pollLatest(label);
      selectedAccount = result.record;
      toast(result.found ? "\u9A8C\u8BC1\u7801: " + result.record.verification_code : "\u6682\u65E0\u65B0\u9A8C\u8BC1\u7801");
      updateUI();
    } catch (e) {
      toast("\u67E5\u8BE2\u5931\u8D25: " + errorMessage2(e), true);
    }
  }
  function errorMessage2(error) {
    return error instanceof Error ? error.message : String(error);
  }

  // src/ui/styles.ts
  var panelCss = `
/* === IdentityForge \u2014 Theme Styles === */
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
  var toastCss = `
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
`;

  // src/main.ts
  function init() {
    GM_setValue("gha_busy", false);
    GM_addStyle(panelCss);
    GM_addStyle(toastCss);
    buildPanel();
    applyTheme(getTheme());
    updateUI();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
