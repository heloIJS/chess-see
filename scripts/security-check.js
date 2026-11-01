#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(root, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (relative === 'node_modules' || relative.startsWith('.tmp_pkg')) continue;
      walk(full, files);
    } else {
      files.push(relative);
    }
  }
  return files;
}

const manifest = JSON.parse(read('manifest.json'));
const files = walk(root);

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');

const allowedPermissions = new Set(['storage', 'offscreen']);
for (const permission of manifest.permissions || []) {
  if (!allowedPermissions.has(permission)) fail(`unexpected permission: ${permission}`);
}

const allowedHosts = new Set([
  '*://*.chess.com/*',
  '*://chess.com/*',
  '*://*.lichess.org/*',
  '*://lichess.org/*'
]);
for (const host of manifest.host_permissions || []) {
  if (!allowedHosts.has(host)) fail(`unexpected host permission: ${host}`);
}
if ((manifest.host_permissions || []).includes('<all_urls>')) fail('<all_urls> is not allowed');

const csp = (manifest.content_security_policy || {}).extension_pages || '';
if (!/script-src 'self'/.test(csp)) fail("CSP must include script-src 'self'");
if (!/object-src 'self'/.test(csp)) fail("CSP must include object-src 'self'");
if (!/connect-src 'self'/.test(csp)) fail("CSP must include connect-src 'self'");
if (/unsafe-eval/.test(csp) && !/wasm-unsafe-eval/.test(csp)) fail('CSP must not allow unsafe-eval');
if (csp.includes("'unsafe-inline'")) fail('CSP must not allow unsafe-inline scripts');

const war = manifest.web_accessible_resources || [];
const exposed = war.flatMap((entry) => entry.resources || []);
for (const resource of exposed) {
  if (resource !== 'src/content/shadow.css') fail(`unexpected web-accessible resource: ${resource}`);
}

const ownFiles = files.filter((file) => file.startsWith('src/') && /\.(js|html|css)$/.test(file));
for (const file of ownFiles) {
  if (file.startsWith('src/lib/')) continue;
  const text = read(file);
  if (/\beval\s*\(/.test(text)) fail(`${file}: eval() found`);
  if (/\bnew\s+Function\s*\(/.test(text)) fail(`${file}: new Function() found`);
  if (/document\.write\s*\(/.test(text)) fail(`${file}: document.write() found`);
  if (/\bfetch\s*\(/.test(text)) warn(`${file}: fetch() found, verify it is not remote`);
  if (/XMLHttpRequest/.test(text)) warn(`${file}: XMLHttpRequest found, verify it is not remote`);
  if (/https?:\/\//.test(text)) warn(`${file}: absolute URL found, verify it is not loaded at runtime`);
  if (/innerHTML\s*=/.test(text)) warn(`${file}: innerHTML assignment found, verify it uses static markup only`);
}

for (const file of files.filter((item) => item.endsWith('.html'))) {
  const text = read(file);
  if (/<script[^>]+src=["']https?:/i.test(text)) fail(`${file}: remote script tag found`);
  if (/<link[^>]+href=["']https?:/i.test(text)) fail(`${file}: remote stylesheet found`);
}

function sha256(relativePath) {
  const data = fs.readFileSync(path.join(root, relativePath));
  return crypto.createHash('sha256').update(data).digest('hex');
}

const versionText = read('src/lib/stockfish/VERSION.txt');
const hashPattern = /^(stockfish\.(?:js|wasm))\s+([a-f0-9]{64})$/gm;
let match;
let checkedHashes = 0;
while ((match = hashPattern.exec(versionText))) {
  checkedHashes += 1;
  const actual = sha256(`src/lib/stockfish/${match[1]}`);
  if (actual !== match[2]) fail(`${match[1]} hash mismatch`);
}
if (checkedHashes !== 2) fail('expected two Stockfish integrity hashes in VERSION.txt');

if (!fs.existsSync(path.join(root, 'LICENSE'))) fail('LICENSE missing');
if (!fs.existsSync(path.join(root, 'SECURITY.md'))) fail('SECURITY.md missing');
if (!fs.existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md'))) fail('THIRD_PARTY_NOTICES.md missing');

console.log('Chess-See security check');
console.log(`Manifest: ${manifest.name} ${manifest.version}`);
console.log(`Permissions: ${(manifest.permissions || []).join(', ')}`);
console.log(`Host permissions: ${(manifest.host_permissions || []).join(', ')}`);
console.log(`Web-accessible resources: ${exposed.join(', ') || '(none)'}`);
console.log(`Stockfish hashes checked: ${checkedHashes}`);

if (warnings.length) {
  console.log('\nWarnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nPASS: no blocking security issues found.');
