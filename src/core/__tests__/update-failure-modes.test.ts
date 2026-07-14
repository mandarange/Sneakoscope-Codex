import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  UPDATE_STAGE_ORDER,
  runSksUpdateNow,
  runSksUpdateReview,
  runSksUpdateRollback
} from '../update-check.js';

test('update review exposes the target, paths, rollback command, and documented stages without mutation', async () => {
  const fixture = await updateFailureFixture('success');
  try {
    const review = await runSksUpdateReview(fixture.options);
    assert.equal(review.ok, true, review.error || 'review failed');
    assert.equal(review.current, '6.2.0');
    assert.equal(review.target, '6.3.0');
    assert.equal(review.npm_bin, fixture.options.npmBin);
    assert.equal(review.node_path, process.execPath);
    assert.equal(review.rollback_command, 'sks update rollback --version 6.2.0 --json');
    assert.deepEqual(review.stages, [...UPDATE_STAGE_ORDER]);
    assert.equal(review.project_mutation, true);
  } finally {
    await fixture.cleanup();
  }
});

test('dry-run uses documented progress ids and never marks side effects as started', async () => {
  const fixture = await updateFailureFixture('success');
  try {
    const result = await runSksUpdateNow({ ...fixture.options, dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'dry_run');
    assert.deepEqual(result.stages.map((stage) => stage.id), [
      'preflight',
      'download_or_registry_check',
      'temporary_install_smoke',
      'global_install'
    ]);
    const operation = JSON.parse(await fs.readFile(result.operation_receipt_path!, 'utf8'));
    assert.equal(operation.side_effects_started, false);
  } finally {
    await fixture.cleanup();
  }
});

test('rollback rejects malformed versions before attempting package mutation', async () => {
  const result = await runSksUpdateRollback({
    version: 'not-a-semver',
    npmBin: null,
    env: { HOME: '/tmp/sks-invalid-rollback' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.update, null);
  assert.equal(result.requested_version, null);
  assert.match(result.error || '', /valid semantic version/);
});

test('global install failure remains failed and records a rollback-capable operation receipt', async () => {
  const fixture = await updateFailureFixture('fail');
  try {
    const result = await runSksUpdateNow(fixture.options);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.install_code, 7);
    assert.ok(result.stages.some((stage) => stage.id === 'global_install' && stage.ok === false));
    assert.equal(result.rollback.previous_version, '6.2.0');
    const operation = JSON.parse(await fs.readFile(result.operation_receipt_path!, 'utf8'));
    assert.equal(operation.state, 'failed');
    assert.equal(operation.side_effects_started, true);
  } finally {
    await fixture.cleanup();
  }
});

test('new-version doctor failure blocks migration and final success', async () => {
  const fixture = await updateFailureFixture('success');
  try {
    const entrypoint = path.join(fixture.root, 'new-sks.mjs');
    await fs.writeFile(entrypoint, "if (process.argv.includes('--version')) { console.log('6.3.0'); process.exit(0); } process.exit(1);\n");
    const result = await runSksUpdateNow({
      ...fixture.options,
      env: {
        ...fixture.options.env,
        SKS_UPDATE_FAKE_INSTALL: '1',
        SKS_UPDATE_FAKE_NEW_ENTRYPOINT: entrypoint,
        SKS_TEST_DOCTOR_OK: undefined,
        SKS_TEST_DOCTOR_FAIL: '1'
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.new_version, '6.3.0');
    assert.equal(result.new_version_doctor?.ok, false);
    assert.equal(result.project_receipt, null);
    assert.ok(result.stages.some((stage) => stage.id === 'new_version_doctor' && stage.ok === false));
  } finally {
    await fixture.cleanup();
  }
});

test('timed-out global install is reported as terminal_uncertain', async () => {
  const fixture = await updateFailureFixture('hang');
  try {
    const result = await runSksUpdateNow({ ...fixture.options, timeoutMs: 200 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'terminal_uncertain');
    assert.match(result.error || '', /completion is uncertain/);
    const operation = JSON.parse(await fs.readFile(result.operation_receipt_path!, 'utf8'));
    assert.equal(operation.state, 'terminal_uncertain');
  } finally {
    await fixture.cleanup();
  }
});

async function updateFailureFixture(mode: 'success' | 'fail' | 'hang') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `sks-update-${mode}-`));
  const npmBin = path.join(root, 'npm-fixture.mjs');
  const globalRoot = path.join(root, 'node_modules');
  await fs.mkdir(path.join(root, 'project'), { recursive: true });
  await fs.writeFile(npmBin, [
    `#!${process.execPath}`,
    "import path from 'node:path';",
    "const args = process.argv.slice(2);",
    "if (args[0] === 'list' && args[1] === '-g') { console.log(JSON.stringify({ dependencies: { sneakoscope: { version: '6.2.0' } } })); process.exit(0); }",
    `if (args[0] === 'root') { console.log(${JSON.stringify(globalRoot)}); process.exit(0); }`,
    "if (args[0] === 'install' && args[1] === '--global') {",
    `  if (${JSON.stringify(mode)} === 'fail') process.exit(7);`,
    `  if (${JSON.stringify(mode)} === 'hang') { setTimeout(() => {}, 10000); } else { console.log('installed'); }`,
    "} else { console.error('unexpected args ' + args.join(' ')); process.exit(2); }"
  ].join('\n'));
  await fs.chmod(npmBin, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: root,
    PATH: '/usr/bin:/bin',
    SKS_GLOBAL_ROOT: path.join(root, '.sneakoscope-global'),
    SKS_MUTATION_LEDGER_ROOT: path.join(root, 'project'),
    SKS_UPDATE_STATUS_PATH: path.join(root, 'update-status.json'),
    SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '6.3.0',
    SKS_UPDATE_SKIP_TEMP_INSTALL_SMOKE: '1',
    SKS_UPDATE_SKIP_SKS_MENUBAR: '1',
    SKS_UPDATE_QUIET: '1',
    SKS_TEST_DOCTOR_OK: '1'
  };
  return {
    root,
    options: {
      npmBin,
      currentVersion: '6.2.0',
      version: '6.3.0',
      projectRoot: path.join(root, 'project'),
      env,
      timeoutMs: 5000,
      json: true
    },
    cleanup: () => fs.rm(root, { recursive: true, force: true })
  };
}
