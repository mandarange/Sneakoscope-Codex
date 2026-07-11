#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeTextAtomic } from '../core/fsx.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');

await fsp.mkdir(distRoot, { recursive: true });
await removeDistMjs(distRoot);
await copyRuntimeConfigFiles();
await writeSkillsManifest();
await removeDistNonRuntimeArtifacts(distRoot);
await writeCommonJsBinScope();
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
  await writeTextAtomic(out, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeCommonJsBinScope() {
  const binDir = path.join(distRoot, 'bin');
  if (!fs.existsSync(binDir)) return;
  await writeTextAtomic(path.join(binDir, 'package.json'), '{"type":"commonjs"}\n');
  await rewriteIfPresent(path.join(binDir, 'sks.js'), (text) =>
    stripSourceMap(text)
      .replace(/^import \{ PACKAGE_VERSION \} from '\.\.\/core\/version\.js';$/m, "const { PACKAGE_VERSION } = require('../core/version.js');")
      .replace(/\nexport \{\};\n?/, '\n')
  );
  await rewriteIfPresent(path.join(binDir, 'sks-dispatch.js'), (text) => {
    const next = stripGeneratedCommonJsExports(
      stripSourceMap(text).replace(/^export async function runSks/m, 'async function runSks'),
      ['runSks']
    );
    return `${next}\n\nexports.runSks = runSks;\n`;
  });
  await rewriteIfPresent(path.join(binDir, 'fast-inline.js'), (text) => {
    const names = [
      'rootJsonFastInline',
      'doctorJsonFastInline',
      'narutoHelpJsonFastInline',
      'hookUserPromptSubmitPerfInline'
    ];
    let next = stripSourceMap(text);
    for (const name of names) {
      next = next.replace(new RegExp(`^export (async )?function ${name}`, 'm'), '$1function ' + name);
    }
    next = stripGeneratedCommonJsExports(next, names);
    return `${next}\n\n${names.map((name) => `exports.${name} = ${name};`).join('\n')}\n`;
  });
  await rewriteIfPresent(path.join(binDir, 'install.js'), (text) =>
    stripSourceMap(text).replace(
      /^import \{ spawnSync \} from 'node:child_process';/m,
      "const { spawnSync } = require('node:child_process');"
    )
  );
}

async function rewriteIfPresent(file, rewrite) {
  if (!fs.existsSync(file)) return;
  const text = await fsp.readFile(file, 'utf8');
  await writeTextAtomic(file, rewrite(text));
}

function stripSourceMap(text) {
  return text.replace(/\n\/\/# sourceMappingURL=.*\.map\s*$/s, '\n');
}

function stripGeneratedCommonJsExports(text, names) {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return text
    .replace(new RegExp(`^exports\\.(${escaped}) = \\1;\\s*$`, 'gm'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
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
