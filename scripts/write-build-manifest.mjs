#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(root, 'dist');

if (!fs.existsSync(distRoot)) {
  throw new Error('dist directory does not exist; run npm run build first');
}

const files = [];
await collect(distRoot, files);
await fsp.writeFile(path.join(distRoot, 'build-manifest.json'), `${JSON.stringify({
  schema: 'sks.dist-build.v1',
  generated_at: new Date().toISOString(),
  files: files.sort()
}, null, 2)}\n`);

async function collect(dir, out) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file, out);
    else if (entry.isFile()) out.push(path.relative(distRoot, file).split(path.sep).join('/'));
  }
}
