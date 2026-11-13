#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  'src/background/service-worker.js',
  'src/content/board-adapter.js',
  'src/content/fen-builder.js',
  'src/content/hotkeys.js',
  'src/content/hud.js',
  'src/content/main.js',
  'src/content/opening-book.js',
  'src/content/overlay.js',
  'src/engine/offscreen.js',
  'src/engine/uci-parser.js',
  'src/engine/worker-bridge.js',
  'src/options/options.js',
  'src/popup/popup.js'
];

let failed = false;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    console.log(`ok   ${file}`);
  } catch (error) {
    failed = true;
    console.error(`fail ${file}`);
    console.error(String(error.stderr || error.message).trim());
  }
}

try {
  JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  console.log('ok   manifest.json');
} catch (error) {
  failed = true;
  console.error('fail manifest.json');
  console.error(error.message);
}

if (failed) process.exit(1);
console.log('\nAll syntax checks passed.');
