import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const outdir = path.join(root, 'dist');
const outfile = path.join(outdir, 'identityforge.user.js');
const metadata = `// ==UserScript==
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
`;

await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ['src/main.ts'],
  outfile,
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  banner: { js: metadata },
  logLevel: 'info',
});

const built = await readFile(outfile, 'utf8');
await writeFile(outfile, built.replace(/\n{3,}/g, '\n\n'));
