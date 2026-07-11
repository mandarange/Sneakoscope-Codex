import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export function sourceIncludes(file, needles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) assert.match(text, new RegExp(escapeRegExp(needle)), `${file} missing ${needle}`);
}

export function packageScriptIncludes(script, needle) {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts?.[script] || '', new RegExp(escapeRegExp(needle)), `${script} missing ${needle}`);
}

export function releaseGateIncludes(id, needle) {
  const manifest = JSON.parse(fs.readFileSync('release-gates.v2.json', 'utf8'));
  const gate = (manifest.gates || []).find((row) => row.id === id);
  assert.ok(gate, `release gate missing: ${id}`);
  assert.match(String(gate.command || ''), new RegExp(escapeRegExp(needle)), `${id} missing ${needle}`);
}

export function runNpmScript(script) {
  const result = spawnSync('npm', ['run', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
    timeout: 120_000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

export function runReleaseGate(id) {
  const manifest = JSON.parse(fs.readFileSync('release-gates.v2.json', 'utf8'));
  const gate = (manifest.gates || []).find((row) => row.id === id);
  assert.ok(gate, `release gate missing: ${id}`);
  const result = spawnSync('/bin/sh', ['-lc', String(gate.command || '')], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
    timeout: Number(gate.timeout_ms || 120_000)
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
