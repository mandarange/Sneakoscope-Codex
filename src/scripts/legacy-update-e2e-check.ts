#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PACKAGE_VERSION, packageRoot, readJson } from '../core/fsx.js';
import { runSksUpdateNow } from '../core/update-check.js';
import { ensureCurrentMigrationBeforeCommand, projectUpdateMigrationReceiptPath } from '../core/update/update-migration-state.js';

const REQUIRED_LEGACY_STAGES = [
  'legacy-team-artifacts',
  'session-state-split',
  'skills-reconcile',
  'menubar-retarget',
  'config-fastmode-normalize',
  'hook-trust-refresh',
  'receipt-rotation'
];

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-legacy-update-e2e-'));
const savedHome = process.env.HOME;
const savedGlobalRoot = process.env.SKS_GLOBAL_ROOT;
const savedCwd = process.cwd();

try {
  const home = path.join(tempRoot, 'home');
  const project = path.join(tempRoot, 'project');
  await seedLegacyFixture(home, project);
  process.env.HOME = home;
  process.env.SKS_GLOBAL_ROOT = path.join(home, '.sneakoscope-global');
  process.chdir(project);

  const output = await captureConsole(async () => runSksUpdateNow({
    version: PACKAGE_VERSION,
    projectRoot: project,
    currentVersion: '4.8.4',
    json: false,
    quiet: false,
    timeoutMs: 60_000,
    env: {
      ...process.env,
      HOME: home,
      SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'),
      SKS_INSTALLED_SKS_VERSION: '4.8.4',
      SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: PACKAGE_VERSION,
      SKS_UPDATE_FAKE_INSTALL: '1',
      SKS_TEST_DOCTOR_OK: '1',
      SKS_TEST_OLD_DOCTOR_FAIL: '1',
      SKS_UPDATE_SKIP_SKS_MENUBAR: '1',
      SKS_REQUIRE_ZELLIJ: '0',
      SKS_POSTINSTALL_GLOBAL_DOCTOR: '0',
      SKS_MIGRATION_DOCTOR_TIMEOUT_MS: '5000'
    }
  }));

  const result = output.value;
  assertGate(result.status === 'updated', 'fake legacy update must finish updated', { status: result.status, error: result.error, stages: result.stages });
  assertGate(result.verification.length === 4 && result.verification.every((row) => row.ok), 'all final self-verification checks must pass', { verification: result.verification });
  assertGate(result.stages.some((stage) => stage.id === 'old_version_doctor_preflight' && stage.status === 'failed_continuing'), 'old-version doctor failure must continue', { stages: result.stages });
  assertGate(result.stages.some((stage) => stage.id === 'npm_global_install' && stage.status === 'fake_installed'), 'fake install stage missing', { stages: result.stages });
  assertGate(/[▸>].*npm_global_install|npm_global_install/.test(output.text) && /final_self_verification/.test(output.text), 'progress output must include stage start/end lines', { output: output.text.slice(-2000) });

  const receipt = await readJson<any>(projectUpdateMigrationReceiptPath(project), null);
  const stageIds = new Set((receipt?.legacy_migration_stages || []).map((stage: any) => stage.id));
  for (const id of REQUIRED_LEGACY_STAGES) assertGate(stageIds.has(id), `legacy stage missing from receipt: ${id}`, { receipt });
  const badStages = (receipt?.legacy_migration_stages || []).filter((stage: any) => stage.ok !== true);
  assertGate(badStages.length === 0, 'legacy migration stages must all be ok', { badStages, receipt });

  const retryProject = path.join(tempRoot, 'retry-project');
  await fsp.mkdir(path.join(retryProject, '.sneakoscope'), { recursive: true });
  const retry = await ensureCurrentMigrationBeforeCommand({
    command: 'legacy-e2e',
    cwd: retryProject,
    env: {
      ...process.env,
      HOME: home,
      SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'),
      SKS_TEST_DOCTOR_TIMEOUT_ONCE: '1',
      SKS_MIGRATION_DOCTOR_TIMEOUT_MS: '1'
    }
  });
  assertGate(retry.ok === true && retry.status === 'repaired', 'timeout doctor must retry once and repair', retry);
  assertGate(retry.warnings.some((warning) => warning.startsWith('doctor_migration_timeout_retry')), 'timeout retry warning missing', retry);

  const failProject = path.join(tempRoot, 'fail-project');
  await fsp.mkdir(path.join(failProject, '.sneakoscope'), { recursive: true });
  const failed = await ensureCurrentMigrationBeforeCommand({
    command: 'legacy-e2e',
    cwd: failProject,
    env: {
      ...process.env,
      HOME: home,
      SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'),
      SKS_TEST_DOCTOR_FAIL: '1',
      SKS_MIGRATION_DOCTOR_TIMEOUT_MS: '1'
    }
  });
  assertGate(failed.ok === false && failed.blockers.includes('doctor_migration_failed'), 'non-timeout doctor failure must not be reported as timeout', failed);
  assertGate(!failed.warnings.some((warning) => warning.startsWith('doctor_migration_timeout_retry')), 'non-timeout failure must not retry', failed);

  console.log(JSON.stringify({
    schema: 'sks.legacy-update-e2e-check.v1',
    ok: true,
    package_version: PACKAGE_VERSION,
    update_status: result.status,
    verification: result.verification.map((row) => ({ id: row.id, ok: row.ok })),
    legacy_stage_count: REQUIRED_LEGACY_STAGES.length,
    progress_lines: output.text.split(/\r?\n/).filter(Boolean).length,
    retry_status: retry.status,
    failure_blockers: failed.blockers
  }, null, 2));
} finally {
  process.chdir(savedCwd);
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  if (savedGlobalRoot === undefined) delete process.env.SKS_GLOBAL_ROOT;
  else process.env.SKS_GLOBAL_ROOT = savedGlobalRoot;
  await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function seedLegacyFixture(home: string, project: string): Promise<void> {
  await fsp.mkdir(path.join(home, '.agents', 'skills'), { recursive: true });
  await fsp.mkdir(path.join(home, '.codex', 'sks-menubar'), { recursive: true });
  await fsp.mkdir(path.join(project, '.sneakoscope'), { recursive: true });
  await fsp.mkdir(path.join(project, '.codex'), { recursive: true });
  await fsp.writeFile(path.join(home, '.agents', 'skills', '.sks-generated.json'), JSON.stringify({
    schema_version: 1,
    generated_by: 'sneakoscope',
    version: '4.8.4',
    skills: [],
    files: []
  }, null, 2) + '\n');
  await fsp.writeFile(path.join(home, '.codex', 'config.toml'), [
    'default_profile = "legacy"',
    '',
    '[hooks.state."legacy"]',
    'trusted_hash = "old-hash"',
    ''
  ].join('\n'));
  await fsp.writeFile(path.join(home, '.codex', 'sks-menubar', 'sks-menubar-action.sh'), [
    '#!/usr/bin/env sh',
    'SKS_ENTRY="/old/sneakoscope/dist/bin/sks.js"',
    'exec "$SKS_ENTRY" "$@"',
    ''
  ].join('\n'));
  await fsp.writeFile(path.join(project, '.sneakoscope', 'current.json'), JSON.stringify({
    mission_id: 'M-legacy',
    phase: 'LEGACY'
  }, null, 2) + '\n');
  await fsp.writeFile(path.join(project, '.codex', 'config.toml'), [
    '[user.fast_mode]',
    'visible = true',
    'default_profile = "sks-fast-high"',
    ''
  ].join('\n'));
  const stamp = path.join(packageRoot(), 'dist', '.sks-build-stamp.json');
  assertGate(fs.existsSync(stamp), 'dist build stamp missing; run npm run build:incremental first', { stamp });
}

async function captureConsole<T>(fn: () => Promise<T>): Promise<{ value: T; text: string }> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  };
  try {
    const value = await fn();
    return { value, text: lines.join('\n') };
  } finally {
    console.log = originalLog;
  }
}

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return;
  console.error(JSON.stringify({ schema: 'sks.legacy-update-e2e-check.v1', ok: false, message, detail }, null, 2));
  process.exit(1);
}
