#!/usr/bin/env node
// @ts-nocheck
/**
 * Writes .sneakoscope/reports/typescript-migration.{json,md}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');

function walkTs(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, out);
    else if (ent.isFile() && ent.name.endsWith('.ts')) out.push(p);
  }
}

function walk(dir, patt, acc) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, patt, acc);
    else if (ent.isFile() && patt(ent.name)) acc.push(p);
  }
}

const tsFiles = [];
walkTs(srcRoot, tsFiles);
let nocheck = 0;
let tsignore = 0;
let expectErrBad = 0;
for (const f of tsFiles) {
  const t = fs.readFileSync(f, 'utf8');
  if (/^\s*\/\/\s*@ts-nocheck/m.test(t) || /\n\/\/\s*@ts-nocheck/.test(t)) nocheck += 1;
  if (/@ts-ignore\b/.test(t)) tsignore += 1;
  for (const line of t.split('\n'))
    if (/@ts-expect-error\b/.test(line) && !/SKS-/.test(line)) expectErrBad += 1;
}

const mjs = [];
walk(distRoot, (n) => n.endsWith('.mjs'), mjs);
const srcMjs = [];
walk(srcRoot, (n) => n.endsWith('.mjs'), srcMjs);

const registryText = fs.readFileSync(path.join(srcRoot, 'cli', 'command-registry.ts'), 'utf8');
const typedEntries = (registryText.match(/\bentry\(/g) || []).length;

const report = {
  schema: 'sks.typescript-migration.v1',
  version: pkg.version,
  runtime_ts_files: tsFiles.length,
  runtime_mjs_files: srcMjs.length,
  src_mjs_runtime_files: srcMjs.length,
  src_mjs_removed: srcMjs.length === 0,
  ts_nocheck: nocheck,
  ts_ignore: tsignore,
  ts_expect_error_without_reason: expectErrBad,
  typed_command_entries: typedEntries,
  dist_mjs_files: mjs.length,
  status: nocheck === 0 && tsignore === 0 && expectErrBad === 0 && srcMjs.length === 0 ? 'verified' : 'blocked',
};

const outDir = path.join(root, '.sneakoscope', 'reports');
fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, 'typescript-migration.json');
const mdPath = path.join(outDir, 'typescript-migration.md');

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const md = `# TypeScript Migration Report (${report.version})\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`;
fs.writeFileSync(mdPath, md);

console.log(JSON.stringify({ schema: `${report.schema}-write.v1`, ok: true, jsonPath, mdPath }, null, 2));
