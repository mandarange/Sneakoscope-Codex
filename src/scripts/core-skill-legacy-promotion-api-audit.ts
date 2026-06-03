#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';

const offenders = [];
for (const rel of listFiles(path.join(root, 'src')).filter((file) => file.endsWith('.ts')).map(relPath)) {
  if (rel === 'src/core/skills/core-skill-deployment.ts') continue;
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/\bpromoteToDeployed\s*\(/.test(line) && !/\bpromoteToDeployedWithLedger\s*\(/.test(line) && !/\bpromoteToDeployedLegacyForCompatibility\s*\(/.test(line)) {
      offenders.push({ file: rel, line: i + 1, snippet: line.trim() });
    }
  }
}

const report = {
  schema: 'sks.core-skill-legacy-promotion-api-audit.v1',
  ok: offenders.length === 0,
  offenders,
  policy: 'runtime/release paths must use promoteToDeployedWithLedger; legacy wrapper is compatibility-only'
};
const out = path.join(root, '.sneakoscope', 'reports', 'core-skill-legacy-promotion-api-audit.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

assertGate(report.ok, 'legacy unledgered promotion API usage found in runtime/release path', report);
emitGate('core-skill:legacy-promotion-api-audit', { offenders: offenders.length });

function listFiles(dir) {
  const out = [];
  walk(dir, out);
  return out;
}

function walk(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile()) out.push(file);
  }
}

function relPath(file) {
  return path.relative(root, file).split(path.sep).join('/');
}
