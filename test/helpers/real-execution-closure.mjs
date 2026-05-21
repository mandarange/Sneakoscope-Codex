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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
