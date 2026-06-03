import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SOURCE_ROOT = process.cwd();

test('non-recursive pipeline checker passes allowed fixture and blocks negative fixture', async () => {
  const allowedRoot = await copyFixtureRoot('allowed');
  const allowed = spawnSync(process.execPath, [path.join(SOURCE_ROOT, 'dist', 'scripts', 'non-recursive-pipeline-check.js'), '--root', allowedRoot, '--json', '--no-write'], {
    encoding: 'utf8'
  });
  assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout);
  assert.equal(JSON.parse(allowed.stdout).ok, true);

  const violationRoot = await copyFixtureRoot('violation');
  const blocked = spawnSync(process.execPath, [path.join(SOURCE_ROOT, 'dist', 'scripts', 'non-recursive-pipeline-check.js'), '--root', violationRoot, '--json', '--no-write'], {
    encoding: 'utf8'
  });
  assert.equal(blocked.status, 1, blocked.stderr || blocked.stdout);
  const report = JSON.parse(blocked.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.secret_redaction_ok, true);
  assert.match(JSON.stringify(report), /REDACTED:openai_api_key/);
  assert.ok(report.violations.length >= 3);
});

async function copyFixtureRoot(name) {
  const src = path.join(SOURCE_ROOT, 'test', 'fixtures', 'non-recursive-pipeline', name);
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), `sks-non-recursive-${name}-`));
  await fs.cp(src, dest, { recursive: true });
  return dest;
}
