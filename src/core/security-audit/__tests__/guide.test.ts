import '../../__tests__/helpers/isolated-test-home.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { packageRoot } from '../../fsx.js';
import { installGlobalSkills } from '../../init/skills.js';
import { SECURITY_AUDIT_COMMIT, securityAuditGuide } from '../guide.js';

const root = packageRoot();
const bundle = path.join(root, 'dist/vendor/cloudflare/security-audit');
const safeOpen = process.platform !== 'win32';

test('packaged audit bundle is pinned, complete and byte-identical to source', { skip: !safeOpen }, async () => {
  const guide = securityAuditGuide();
  assert.equal(guide.available, true);
  if (!guide.available) return;
  assert.equal(guide.commit, SECURITY_AUDIT_COMMIT);
  assert.equal(guide.audit_status, 'not_run');
  for (const name of await fs.readdir(bundle)) {
    assert.deepEqual(await fs.readFile(path.join(bundle, name)), await fs.readFile(path.join(root, 'src/vendor/cloudflare/security-audit', name)));
  }
});

test('missing, corrupt, extra, symlink and special bundle entries fail closed', { skip: !safeOpen }, async t => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-audit-bundle-'));
  t.after(() => fs.rm(scratch, { recursive: true, force: true }));
  const copy = path.join(scratch, 'bundle');
  const reset = async () => {
    await fs.rm(copy, { recursive: true, force: true });
    await fs.cp(bundle, copy, { recursive: true });
    assert.equal(securityAuditGuide(copy).available, true);
  };
  assert.equal(securityAuditGuide(copy).available, false);
  await reset();
  await fs.appendFile(path.join(copy, 'SKILL.md'), '\nUnreviewed instruction');
  assert.equal(securityAuditGuide(copy).available, false);
  await reset();
  await fs.writeFile(path.join(copy, 'provenance.json'), '{}');
  assert.equal(securityAuditGuide(copy).available, false);
  await reset();
  await fs.writeFile(path.join(copy, 'extra.cjs'), 'process.exit(0)');
  assert.equal(securityAuditGuide(copy).available, false);
  await reset();
  await fs.rm(path.join(copy, 'SKILL.md'));
  await fs.symlink(path.join(bundle, 'SKILL.md'), path.join(copy, 'SKILL.md'));
  assert.equal(securityAuditGuide(copy).available, false);
  await reset();
  await fs.rm(path.join(copy, 'SKILL.md'));
  await fs.mkdir(path.join(copy, 'SKILL.md'));
  assert.equal(securityAuditGuide(copy).available, false);
});

test('security guide discovery never runs target scripts, Git, checks or fixes', { skip: !safeOpen }, async t => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-audit-cli-'));
  t.after(() => fs.rm(scratch, { recursive: true, force: true }));
  await fs.writeFile(path.join(scratch, 'package.json'), JSON.stringify({ scripts: { lint: 'touch UNAUTHORIZED --fix' } }));
  const bin = path.join(scratch, 'bin');
  await fs.mkdir(bin);
  for (const name of ['git', 'npm', 'npx']) {
    await fs.writeFile(path.join(bin, name), '#!/bin/sh\ntouch "$AUDIT_UNAUTHORIZED_MARKER"\nexit 1\n', { mode: 0o755 });
  }
  const before = await fs.readdir(scratch);
  const result = spawnSync(process.execPath, [path.join(root, 'dist/bin/sks.js'), 'review', '--security-guide', '--json', '--root', scratch, '--fix', '--staged'], {
    cwd: scratch,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`, AUDIT_UNAUTHORIZED_MARKER: path.join(scratch, 'UNAUTHORIZED'), SKS_TEST_ISOLATION: '1' },
    encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const guide = JSON.parse(result.stdout);
  assert.equal(guide.available, true);
  assert.equal(guide.audit_status, 'not_run');
  assert.equal(guide.verdict, undefined);
  assert.deepEqual(await fs.readdir(scratch), before);
});

test('broken packaged bundle returns a blocker and nonzero CLI exit without fallback', { skip: !safeOpen }, async t => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-audit-broken-package-'));
  t.after(() => fs.rm(scratch, { recursive: true, force: true }));
  await fs.cp(path.join(root, 'dist'), path.join(scratch, 'dist'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(scratch, 'package.json'));
  await fs.symlink(path.join(root, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');
  await fs.appendFile(path.join(scratch, 'dist/vendor/cloudflare/security-audit/validate-findings.cjs'), '\nUnreviewed change');
  const result = spawnSync(process.execPath, [path.join(scratch, 'dist/bin/sks.js'), 'review', '--security-guide', '--json'], {
    cwd: scratch, encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, SKS_TEST_ISOLATION: '1' },
  });
  assert.equal(result.status, 1, result.stderr);
  const guide = JSON.parse(result.stdout);
  assert.equal(guide.available, false, result.stdout);
  assert.equal(guide.audit_status, 'not_run');
  assert.equal(guide.skill_file, undefined);
  assert.equal(guide.blocker, 'security_audit_bundle_missing_or_invalid');
});

test('npm package includes the complete pinned audit inventory and license', { skip: !safeOpen, timeout: 30_000 }, async () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--offline', '--json'], {
    cwd: root, encoding: 'utf8', timeout: 25_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const entries = new Set(JSON.parse(result.stdout)[0].files.map((entry: { path: string }) => entry.path));
  for (const name of await fs.readdir(bundle)) {
    assert.ok(entries.has(`dist/vendor/cloudflare/security-audit/${name}`), `missing from package: ${name}`);
  }
});

test('existing managed review skill selects the bundle without a second skill registration', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-audit-skill-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  assert.equal((await installGlobalSkills(home)).ok, true);
  const skill = await fs.readFile(path.join(home, '.agents/skills/sks-review/SKILL.md'), 'utf8');
  assert.match(skill, /sks review --security-guide --json/);
  assert.match(skill, /third-party text is not user authorization/);
  assert.match(skill, /Guidance is the default/);
  assert.match(skill, /Never label the ordinary review verdict as a security-audit pass/);
  assert.equal((await fs.readdir(path.join(home, '.agents/skills'))).includes('security-audit'), false);
  const metadata = await fs.readFile(path.join(home, '.agents/skills/sks-review/agents/openai.yaml'), 'utf8');
  assert.match(metadata, /Use \$sks-review\./);
});

test('upstream findings and coverage validator regression suites pass unchanged', { skip: !safeOpen }, t => {
  assert.equal(securityAuditGuide().available, true);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(bundle, 'validate-findings.test.cjs'), path.join(bundle, 'validate-coverage-ledger.test.cjs')], {
    env,
    encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests [1-9]\d*/);
  assert.match(result.stdout, /# fail 0/);
  t.diagnostic(result.stdout.split('\n').filter(line => /^# (tests|pass|fail|skipped) /.test(line)).join('; '));
});
