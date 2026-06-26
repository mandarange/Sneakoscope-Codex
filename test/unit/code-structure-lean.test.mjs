import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('code structure scan emits lean change evidence for explicit changed files', async () => {
  const mod = await import('../../dist/core/code-structure.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-code-structure-lean-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  await fs.writeFile(path.join(root, 'src/demo.ts'), [
    "import fs from 'node:fs';",
    '// sks-lean: ceiling=local fixture; revisit_when=shared scanner grows; upgrade=extract parser fixture',
    'const cwdExists = fs.existsSync(".");',
    'export const value = cwdExists ? 1 : 0;'
  ].join('\n'));
  await fs.writeFile(path.join(root, 'test/demo.test.ts'), [
    "import test from 'node:test';",
    "test('fixture', () => {",
    '  Boolean(true);',
    '});'
  ].join('\n'));

  const report = await mod.scanCodeStructure(root, {
    includeOk: true,
    changedFiles: ['src/demo.ts', 'test/demo.test.ts']
  });

  assert.equal(report.lean_change_evidence.schema, 'sks.lean-change-evidence.v1');
  assert.equal(report.lean_change_evidence.policy_id, 'sks.lean-engineering-policy.v1');
  assert.deepEqual(report.dependencies_added, []);
  assert.ok(report.runnable_checks.includes('test/demo.test.ts'));
  assert.ok(report.intentional_simplifications.some((marker) => marker.status === 'complete'));
  assert.equal(report.semantic_review.status, 'pass');
});

test('code structure scan only treats real ts-nocheck directives as scoped blockers', async () => {
  const mod = await import('../../dist/core/code-structure.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-code-structure-nocheck-'));
  await fs.mkdir(path.join(root, 'src/core'), { recursive: true });
  await fs.mkdir(path.join(root, 'src/scripts'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  await fs.writeFile(path.join(root, 'src/core/code-structure.ts'), [
    'const detector = "/@ts-nocheck/";',
    'export const ok = detector.length;'
  ].join('\n'));
  await fs.writeFile(path.join(root, 'src/scripts/seo-fixture-check.ts'), [
    '// @ts-nocheck',
    'export const fixture = 1;'
  ].join('\n'));
  await fs.writeFile(path.join(root, 'test/nocheck.test.ts'), [
    "import test from 'node:test';",
    "test('fixture', () => Boolean(true));"
  ].join('\n'));

  const report = await mod.scanCodeStructure(root, {
    includeOk: true,
    changedFiles: ['src/core/code-structure.ts', 'src/scripts/seo-fixture-check.ts', 'test/nocheck.test.ts']
  });

  assert.equal(report.files.find((entry) => entry.path === 'src/core/code-structure.ts').lean_signals.ts_nocheck, false);
  assert.equal(report.files.find((entry) => entry.path === 'src/scripts/seo-fixture-check.ts').lean_signals.ts_nocheck, true);
  assert.equal(report.semantic_review.status, 'needs-review');
  assert.equal(report.semantic_review.findings.some((finding) => finding.severity === 'blocker'), false);
});
