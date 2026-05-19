#!/usr/bin/env node
/**
 * Fail if runtime TypeScript uses forbidden suppressions (@ts-nocheck, @ts-ignore)
 * or @ts-expect-error without an SKS-annotated rationale.
 *
 * Allowed: generated src/generated/** waivers — must include @ts-expect-error SKS-GEN:
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

const failures = [];

function scanFile(abs, rel) {
  const txt = fs.readFileSync(abs, 'utf8');
  const lines = txt.split(/\r?\n/);
  const relPosix = rel.split(path.sep).join('/');
  const inGenerated = relPosix.startsWith('generated/');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNo = idx + 1;
    if (trimmed.includes('@ts-nocheck')) failures.push({ file: rel, line: lineNo, rule: '@ts-nocheck' });
    if (trimmed.includes('@ts-ignore')) failures.push({ file: rel, line: lineNo, rule: '@ts-ignore' });
    if (/@ts-expect-error\b/.test(line)) {
      if (inGenerated) {
        if (!/@ts-expect-error\s+SKS-GEN:/.test(trimmed))
          failures.push({ file: rel, line: lineNo, rule: '@ts-expect-error missing SKS-GEN reason' });
        return;
      }
      if (!/@ts-expect-error\s+SKS-/.test(trimmed))
        failures.push({ file: rel, line: lineNo, rule: '@ts-expect-error missing SKS- reason prefix' });
    }
  });
}

function walk(dir, relDir = '') {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walk(abs, rel);
    else if (ent.isFile() && ent.name.endsWith('.ts')) scanFile(abs, rel);
  }
}

if (fs.existsSync(srcRoot)) walk(srcRoot);

const result = {
  schema: 'sks.ts-suppression-check.v1',
  ok: failures.length === 0,
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
