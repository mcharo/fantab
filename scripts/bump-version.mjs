#!/usr/bin/env node
// Bump the extension version everywhere it lives: package.json and the MV3
// manifest. Only the "version" string is rewritten, so the rest of each file's
// formatting is left untouched.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: node scripts/bump-version.mjs <x.y.z>');
  process.exit(1);
}

const files = ['package.json', 'public/manifest.json'];
const versionField = /("version":\s*")[^"]*(")/;

for (const file of files) {
  const original = readFileSync(file, 'utf8');

  if (!versionField.test(original)) {
    console.error(`error: no "version" field found in ${file}`);
    process.exit(1);
  }

  writeFileSync(file, original.replace(versionField, `$1${version}$2`));
  console.log(`updated ${file} -> ${version}`);
}
