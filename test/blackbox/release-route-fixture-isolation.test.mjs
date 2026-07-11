import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const missionsDir = path.join(root, '.sneakoscope', 'missions');

test('DFix release fixture is hermetic and preserves the parent active route', (t) => {
  const activeRoot = createActiveProject(t, 'dfix');
  const stateFile = path.join(activeRoot, '.sneakoscope', 'state', 'current.json');
  const stateBefore = fs.readFileSync(stateFile, 'utf8');
  const run = spawnSync(process.execPath, [path.join(root, 'dist/scripts/dfix-fixture-check.js')], {
    cwd: activeRoot,
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.gate, 'dfix:fixture');
  assert.ok(path.isAbsolute(result.fixture_root));
  assert.equal(isInside(root, result.fixture_root), false, 'fixture root must be outside the project');
  assert.equal(fs.existsSync(path.join(missionsDir, result.mission_id)), false, 'fixture mission must not be written to the project runtime');
  assert.equal(fs.existsSync(path.join(activeRoot, '.sneakoscope', 'missions')), false, 'fixture mission must not be written beside the parent active route');
  assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBefore, 'parent active route state must remain byte-identical');
  assert.equal(fs.existsSync(result.fixture_root), false, 'fixture temp root must be deleted when the gate exits');
});

test('PPT mock blackbox stays hermetic and requires an honest mock-only trust report', (t) => {
  const activeRoot = createActiveProject(t, 'ppt');
  const stateFile = path.join(activeRoot, '.sneakoscope', 'state', 'current.json');
  const stateBefore = fs.readFileSync(stateFile, 'utf8');
  const run = spawnSync(process.execPath, [path.join(root, 'dist/scripts/ppt-full-e2e-blackbox-check.js')], {
    cwd: activeRoot,
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.trust_report_linked, true);
  assert.equal(result.trust_ok, false);
  assert.equal(result.trust_status, 'mock_only');
  assert.equal(result.wrongness_linked, true);
  assert.equal(result.artifacts.wrongness_schema, 'sks.triwiki-wrongness-proof-evidence.v1');
  assert.equal(result.mock_fake_not_verified_real, true);
  assert.equal(result.exported_slide_images_count, result.slide_count);
  assert.equal(result.generated_slide_review_count, result.slide_count);
  assert.equal(result.artifacts.slideIssues.validation.ok, true);
  assert.equal(result.artifacts.callouts.verified_level, 'mock_only');
  assert.equal(fs.existsSync(path.join(missionsDir, result.mission_id)), false, 'blackbox mission must not be written to the project runtime');
  assert.equal(fs.existsSync(path.join(activeRoot, '.sneakoscope', 'missions')), false, 'blackbox mission must not be written beside the parent active route');
  assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBefore, 'parent active route state must remain byte-identical');
  assert.equal(fs.existsSync(path.dirname(result.deck)), false, 'blackbox temp root must be deleted when the gate exits');
});

test('former public fixture environment flags cannot bypass an active route', (t) => {
  const activeRoot = createActiveProject(t, 'bypass');
  const stateFile = path.join(activeRoot, '.sneakoscope', 'state', 'current.json');
  const stateBefore = fs.readFileSync(stateFile, 'utf8');
  const run = spawnSync(process.execPath, [path.join(root, 'dist/bin/sks.js'), 'dfix', 'fixture', '--json'], {
    cwd: activeRoot,
    env: {
      ...process.env,
      SKS_TEST_ISOLATION: '1',
      SKS_RELEASE_FIXTURE_ACTIVE_ROUTE_BYPASS: '1',
      SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
      NODE_ENV: 'production',
      CI: 'true'
    },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(run.status, 1, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.active_mission_id, 'M-active-bypass');
  assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBefore);
  assert.equal(fs.existsSync(path.join(activeRoot, '.sneakoscope', 'missions')), false);
});

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function createActiveProject(t, label) {
  const activeRoot = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', `sks-release-active-${label}-`));
  const stateDir = path.join(activeRoot, '.sneakoscope', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'current.json'), `${JSON.stringify({
    mission_id: `M-active-${label}`,
    mode: 'NARUTO',
    route: '$Naruto',
    phase: 'EXECUTE'
  })}\n`);
  t.after(() => fs.rmSync(activeRoot, { recursive: true, force: true }));
  return activeRoot;
}
