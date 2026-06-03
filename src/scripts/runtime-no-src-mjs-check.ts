#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = walk(path.join(root, 'src'))
  .filter((file) => file.endsWith('.mjs'))
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
  .sort();

const result = {
  schema: 'sks.runtime-no-src-mjs.v1',
  ok: files.length === 0,
  src_mjs_runtime_files: files.length,
  files
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile()) out.push(file);
  }
  return out;
}
