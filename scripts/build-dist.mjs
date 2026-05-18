#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');

await fsp.mkdir(distRoot, { recursive: true });
await copyMjsTree(srcRoot, distRoot);
await copyRuntimeConfigFiles();
await copyExecutableBit(path.join(distRoot, 'bin', 'sks.js'));
await writeBuildManifest();

async function copyMjsTree(fromDir, toDir) {
  for (const entry of await fsp.readdir(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyMjsTree(from, to);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.copyFile(from, to);
  }
}

async function copyExecutableBit(file) {
  if (fs.existsSync(file)) await fsp.chmod(file, 0o755).catch(() => {});
}

async function copyRuntimeConfigFiles() {
  const configs = ['core/performance-budgets.json'];
  for (const rel of configs) {
    const from = path.join(srcRoot, rel);
    const to = path.join(distRoot, rel);
    if (!fs.existsSync(from)) continue;
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.copyFile(from, to);
  }
}

async function writeBuildManifest() {
  const files = [];
  await collect(distRoot, files);
  await fsp.writeFile(path.join(distRoot, 'build-manifest.json'), `${JSON.stringify({
    schema: 'sks.dist-build.v1',
    generated_at: new Date().toISOString(),
    files: files.sort()
  }, null, 2)}\n`);
}

async function collect(dir, out) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file, out);
    else if (entry.isFile()) out.push(path.relative(distRoot, file).split(path.sep).join('/'));
  }
}
