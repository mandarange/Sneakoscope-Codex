#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');

await fsp.mkdir(distRoot, { recursive: true });
await removeDistMjs(distRoot);
await copyRuntimeConfigFiles();
await writeSkillsManifest();
await removeDistNonRuntimeArtifacts(distRoot);
await import('./write-build-manifest.js');

async function removeDistMjs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeDistMjs(file);
    else if (entry.isFile() && entry.name.endsWith('.mjs')) await fsp.rm(file, { force: true });
  }
}

async function removeDistNonRuntimeArtifacts(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeDistNonRuntimeArtifacts(file);
    else if (entry.isFile() && (entry.name.endsWith('.js.map') || entry.name.endsWith('.d.ts.map') || entry.name.endsWith('.d.ts'))) {
      await fsp.rm(file, { force: true });
    }
  }
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
  await copyDirIfPresent(
    path.join(srcRoot, 'vendor', 'openai-codex'),
    path.join(distRoot, 'vendor', 'openai-codex')
  );
}

async function writeSkillsManifest() {
  const { generatePackagedSkillsManifest } = await import('../core/init/skills.js');
  const manifest = await generatePackagedSkillsManifest();
  const out = path.join(distRoot, 'config', 'skills-manifest.json');
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await fsp.writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function copyDirIfPresent(from, to) {
  if (!fs.existsSync(from)) return;
  await fsp.rm(to, { recursive: true, force: true });
  await fsp.mkdir(to, { recursive: true });
  for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDirIfPresent(source, target);
    else if (entry.isFile()) await fsp.copyFile(source, target);
  }
}
