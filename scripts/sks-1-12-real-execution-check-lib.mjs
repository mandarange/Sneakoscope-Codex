#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root, runSksJson } from './sks-1-11-gate-lib.mjs';

export { assertGate, emitGate, root, runSksJson };

export function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

export function json(rel) {
  return JSON.parse(read(rel));
}

export function contains(rel, needles) {
  const text = read(rel);
  const missing = needles.filter((needle) => !text.includes(needle));
  return { ok: missing.length === 0, missing };
}

export function requireContains(gate, rel, needles) {
  const result = contains(rel, needles);
  assertGate(result.ok, `${gate} missing required wiring in ${rel}`, { missing: result.missing });
}

export function requirePackageScripts(gate, scripts) {
  const pkg = json('package.json');
  const missing = scripts.filter((script) => !pkg.scripts?.[script]);
  assertGate(missing.length === 0, `${gate} package scripts missing`, { missing });
}
