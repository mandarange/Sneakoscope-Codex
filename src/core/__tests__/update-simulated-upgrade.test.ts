import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  UPDATE_STAGE_ORDER,
  runSksUpdateNow,
  runSksUpdateRollback
} from '../update-check.js';

test('simulated 6.2 to 6.3 update and rollback bind receipts to the newly installed package', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-620-630-'));
  const home = path.join(root, 'home');
  const projectRoot = path.join(root, 'project');
  const npmGlobalRoot = path.join(root, 'npm-global', 'node_modules');
  const installedPackageRoot = path.join(npmGlobalRoot, 'sneakoscope');
  const installedEntrypoint = path.join(installedPackageRoot, 'dist', 'bin', 'sks.js');
  const stateFile = path.join(root, 'installed-version.txt');
  const tempProbe = path.join(root, 'temporary-sks.mjs');
  const fakeNpm = path.join(root, 'npm-fixture.mjs');
  try {
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(home, { recursive: true });
    await createInstalledPackageFixture(installedPackageRoot, '6.3.0');
    await fs.writeFile(stateFile, '6.2.0\n');
    await fs.writeFile(tempProbe, [
      '#!/usr/bin/env node',
      "if (process.argv.includes('--version')) { console.log(process.env.SKS_TEST_TEMP_TARGET || '0.0.0'); process.exit(0); }",
      "if (process.argv[2] === 'doctor') { console.log(JSON.stringify({ ok: true })); process.exit(0); }",
      "process.exit(1);"
    ].join('\n'));
    await fs.chmod(tempProbe, 0o755);
    await createFakeNpm({ fakeNpm, stateFile, npmGlobalRoot, installedPackageRoot });

    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      PATH: '/usr/bin:/bin',
      SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'),
      SKS_MUTATION_LEDGER_ROOT: projectRoot,
      SKS_UPDATE_STATUS_PATH: path.join(home, 'update-status.json'),
      SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '6.3.0',
      SKS_UPDATE_TEMP_INSTALL_FIXTURE_ENTRYPOINT: tempProbe,
      SKS_TEST_TEMP_TARGET: '6.3.0',
      SKS_TEST_DOCTOR_OK: '1',
      SKS_UPDATE_SKIP_SKS_MENUBAR: '1',
      SKS_UPDATE_QUIET: '1'
    };
    const updated = await runSksUpdateNow({
      npmBin: fakeNpm,
      currentVersion: '6.2.0',
      version: '6.3.0',
      projectRoot,
      env: baseEnv,
      timeoutMs: 15_000,
      json: true
    });
    assert.equal(updated.ok, true, updated.error || 'update failed');
    assert.equal(updated.status, 'updated');
    assert.equal(updated.from, '6.2.0');
    assert.equal(updated.new_version, '6.3.0');
    assert.equal(updated.temporary_install_smoke?.status, 'verified');
    assertStageOrder(updated.stages.map((stage) => stage.id));
    const updateReceipt = JSON.parse(await fs.readFile(
      path.join(projectRoot, '.sneakoscope', 'update', 'migration-receipt.json'),
      'utf8'
    ));
    assert.equal(updateReceipt.sks_version, '6.3.0');
    assert.equal(updated.project_receipt?.sks_version, '6.3.0');
    assert.equal(updated.rollback.previous_version, '6.2.0');
    const updateOperation = JSON.parse(await fs.readFile(updated.operation_receipt_path!, 'utf8'));
    assert.equal(updateOperation.state, 'succeeded');
    assert.equal(updateOperation.target_version, '6.3.0');

    const rolledBack = await runSksUpdateRollback({
      npmBin: fakeNpm,
      currentVersion: '6.3.0',
      version: '6.2.0',
      projectRoot,
      env: { ...baseEnv, SKS_TEST_TEMP_TARGET: '6.2.0' },
      timeoutMs: 15_000,
      json: true
    });
    assert.equal(rolledBack.ok, true, rolledBack.error || 'rollback failed');
    assert.equal(rolledBack.requested_version, '6.2.0');
    assert.equal(rolledBack.update?.new_version, '6.2.0');
    assert.equal(rolledBack.update?.project_receipt?.sks_version, '6.2.0');
    assertStageOrder(rolledBack.update?.stages.map((stage) => stage.id) || []);
    const rollbackOperation = JSON.parse(await fs.readFile(rolledBack.receipt_path!, 'utf8'));
    assert.equal(rollbackOperation.kind, 'rollback');
    assert.equal(rollbackOperation.state, 'rolled_back');
    assert.equal(rollbackOperation.previous_version, '6.3.0');
    assert.equal(JSON.parse(await fs.readFile(path.join(installedPackageRoot, 'package.json'), 'utf8')).version, '6.2.0');

    const verificationFailure = await runSksUpdateNow({
      npmBin: fakeNpm,
      currentVersion: '6.2.0',
      version: '6.3.0',
      projectRoot,
      env: { ...baseEnv, SKS_TEST_TEMP_TARGET: '6.3.0', SKS_FAKE_BAD_STAMP: '1' },
      timeoutMs: 15_000,
      json: true
    });
    assert.equal(verificationFailure.ok, false);
    assert.equal(verificationFailure.status, 'updated_with_issues');
    assert.ok(verificationFailure.verification.some((item) => item.id === 'dist_stamp' && item.ok === false));
    assert.ok(verificationFailure.stages.some((stage) => stage.id === 'final_self_verification' && stage.ok === false));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function createInstalledPackageFixture(packageRoot: string, version: string): Promise<void> {
  const binDir = path.join(packageRoot, 'dist', 'bin');
  const updateDir = path.join(packageRoot, 'dist', 'core', 'update');
  const initDir = path.join(packageRoot, 'dist', 'core', 'init');
  const doctorDir = path.join(packageRoot, 'dist', 'core', 'doctor');
  await Promise.all([binDir, updateDir, initDir, doctorDir].map((dir) => fs.mkdir(dir, { recursive: true })));
  await fs.writeFile(path.join(packageRoot, 'package.json'), `${JSON.stringify({ name: 'sneakoscope', version, type: 'module' }, null, 2)}\n`);
  await fs.writeFile(path.join(packageRoot, 'dist', '.sks-build-stamp.json'), `${JSON.stringify({ package_version: version })}\n`);
  await fs.writeFile(path.join(binDir, 'sks.js'), [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');",
    "const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;",
    "if (process.argv.includes('--version')) { console.log(version); process.exit(0); }",
    "if (process.argv[2] === 'doctor') { console.log(JSON.stringify({ ok: true })); process.exit(0); }",
    "console.error('unsupported fixture command'); process.exit(1);"
  ].join('\n'));
  await fs.writeFile(path.join(updateDir, 'update-migration-state.js'), [
    "import fs from 'node:fs/promises';",
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');",
    "export async function writeProjectUpdateMigrationReceipt(input) {",
    "  const version = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')).version;",
    "  const receipt = { schema: 'sks.project-migration-receipt.v2', status: 'current', sks_version: version, root: input.root, source: input.source, generated_at: new Date().toISOString(), from_version: input.fromVersion || null, installation_epoch_path: path.join(input.root, '.sneakoscope-global', 'installation-epoch.json'), installation_epoch_sha256: 'fixture-' + version, required_blockers: [], optional_warnings: [], blockers: [], warnings: [] };",
    "  const file = path.join(input.root, '.sneakoscope', 'update', 'migration-receipt.json');",
    "  await fs.mkdir(path.dirname(file), { recursive: true });",
    "  await fs.writeFile(file, JSON.stringify(receipt, null, 2) + '\\n');",
    "  return receipt;",
    "}"
  ].join('\n'));
  await fs.writeFile(path.join(initDir, 'skills.js'), [
    "import fs from 'node:fs/promises';",
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');",
    "export async function reconcileSkills(input) {",
    "  const version = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')).version;",
    "  await fs.mkdir(input.targetDir, { recursive: true });",
    "  await fs.writeFile(path.join(input.targetDir, '.sks-generated.json'), JSON.stringify({ version }) + '\\n');",
    "  return { schema: 'sks.skill-reconcile.v1', ok: true, installed: [], updated: ['fixture'], removed: [] };",
    "}"
  ].join('\n'));
  const repairs = [
    ['imagegen-repair.js', 'repairCodexImagegen'],
    ['computer-use-repair.js', 'repairComputerUse'],
    ['browser-use-repair.js', 'repairBrowserUse']
  ];
  for (const [file, name] of repairs) {
    await fs.writeFile(path.join(doctorDir, file!), `export async function ${name}() { return { ok: true, recovered: true, attempted: true }; }\n`);
  }
}

async function createFakeNpm(input: {
  fakeNpm: string;
  stateFile: string;
  npmGlobalRoot: string;
  installedPackageRoot: string;
}): Promise<void> {
  await fs.writeFile(input.fakeNpm, [
    `#!${process.execPath}`,
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    `const stateFile = ${JSON.stringify(input.stateFile)};`,
    `const npmGlobalRoot = ${JSON.stringify(input.npmGlobalRoot)};`,
    `const packageRoot = ${JSON.stringify(input.installedPackageRoot)};`,
    "const args = process.argv.slice(2);",
    "const current = () => fs.readFileSync(stateFile, 'utf8').trim();",
    "if (args[0] === 'list' && args[1] === '-g') { console.log(JSON.stringify({ dependencies: { sneakoscope: { version: current() } } })); process.exit(0); }",
    "if (args[0] === 'root' && (args[1] === '-g' || args[1] === '--global')) { console.log(npmGlobalRoot); process.exit(0); }",
    "if (args[0] === 'install' && args[1] === '--global') {",
    "  const spec = args.find((arg) => arg.startsWith('sneakoscope@'));",
    "  const version = spec ? spec.slice('sneakoscope@'.length) : '';",
    "  if (!/^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) process.exit(2);",
    "  const manifestPath = path.join(packageRoot, 'package.json');",
    "  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); manifest.version = version;",
    "  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');",
    "  const stampVersion = process.env.SKS_FAKE_BAD_STAMP === '1' ? '0.0.0' : version;",
    "  fs.writeFileSync(path.join(packageRoot, 'dist', '.sks-build-stamp.json'), JSON.stringify({ package_version: stampVersion }) + '\\n');",
    "  fs.writeFileSync(stateFile, version + '\\n');",
    "  console.log('installed ' + version); process.exit(0);",
    "}",
    "console.error('unexpected npm fixture args: ' + args.join(' ')); process.exit(1);"
  ].join('\n'));
  await fs.chmod(input.fakeNpm, 0o755);
}

function assertStageOrder(actual: string[]): void {
  let previous = -1;
  for (const stage of UPDATE_STAGE_ORDER) {
    const index = actual.indexOf(stage);
    assert.ok(index >= 0, `missing stage ${stage}: ${actual.join(', ')}`);
    assert.ok(index > previous, `stage ${stage} was out of order: ${actual.join(', ')}`);
    previous = index;
  }
}
