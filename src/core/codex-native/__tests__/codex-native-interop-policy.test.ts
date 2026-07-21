import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildCodexNativeInteropPolicy } from '../codex-native-interop-policy.js';

const SECRET_MARKER = 'INTEROP_SKILL_SECRET';

for (const scenario of [
  { scope: 'global' as const, symlink: 'ancestor' as const },
  { scope: 'global' as const, symlink: 'leaf' as const },
  { scope: 'project' as const, symlink: 'ancestor' as const },
  { scope: 'project' as const, symlink: 'leaf' as const }
]) {
  test(`interop policy rejects a ${scenario.scope} ${scenario.symlink} symlink without reflecting external skill names`, async () => {
    const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-interop-policy-confined-'));
    const root = path.join(fixture, 'project');
    const home = path.join(fixture, 'home');
    const codexHome = path.join(home, '.codex');
    const owner = scenario.scope === 'global' ? home : root;
    const outside = path.join(fixture, `outside-${scenario.scope}-${scenario.symlink}-${SECRET_MARKER}\nforged`);
    const externalSkillName = `${SECRET_MARKER}\nforged-skill`;
    const oldHome = process.env.HOME;
    const oldCodexHome = process.env.CODEX_HOME;
    try {
      process.env.HOME = home;
      process.env.CODEX_HOME = codexHome;
      await fsp.mkdir(root, { recursive: true });
      await fsp.mkdir(home, { recursive: true });
      if (scenario.symlink === 'ancestor') {
        await fsp.mkdir(path.join(outside, 'skills', externalSkillName), { recursive: true });
        await fsp.symlink(outside, path.join(owner, '.agents'));
      } else {
        await fsp.mkdir(path.join(owner, '.agents'), { recursive: true });
        await fsp.mkdir(path.join(outside, externalSkillName), { recursive: true });
        await fsp.symlink(outside, path.join(owner, '.agents', 'skills'));
      }
      const before = await snapshotTree(outside);

      const report = await buildCodexNativeInteropPolicy({
        root,
        codexHome,
        inventory: { plugins: [], blockers: [] }
      });

      const expectedReason = scenario.symlink === 'ancestor' ? 'ancestor_symlink' : 'leaf_symlink';
      assert.equal(report.ok, false);
      assert.deepEqual(report.blockers, [`unsafe_skill_scan_root:${scenario.scope}:${expectedReason}`]);
      assert.deepEqual(report.detection.skill_names, []);
      assert.deepEqual(report.detection.preserved_skill_names, []);
      assert.deepEqual(report.actions, []);
      assert.deepEqual(await snapshotTree(outside), before);
      assertClosedReport(report, outside, externalSkillName);

      const artifact = await fsp.readFile(
        path.join(root, '.sneakoscope', 'reports', 'codex-native-interop-policy.json'),
        'utf8'
      );
      assert.equal(artifact.includes(outside), false);
      assert.equal(artifact.includes(SECRET_MARKER), false);
      assert.equal(artifact.includes(externalSkillName), false);
    } finally {
      if (oldHome === undefined) delete process.env.HOME;
      else process.env.HOME = oldHome;
      if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = oldCodexHome;
      await fsp.rm(fixture, { recursive: true, force: true });
    }
  });
}

test('interop policy keeps safe root dedupe, reserved-skill preservation, and inventory blocker behavior', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-interop-policy-safe-'));
  const codexHome = path.join(root, '.codex');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = root;
    process.env.CODEX_HOME = codexHome;
    for (const name of ['ordinary-skill', 'start-work', 'ulw-loop']) {
      await fsp.mkdir(path.join(root, '.agents', 'skills', name), { recursive: true });
    }
    await fsp.mkdir(path.join(codexHome, 'skills', 'ulw-plan'), { recursive: true });

    const report = await buildCodexNativeInteropPolicy({
      root,
      codexHome,
      inventory: {
        plugins: [{ id: 'Fixture.Plugin', name: 'Fixture Name' }],
        blockers: ['inventory_probe_unavailable']
      }
    });

    assert.equal(report.ok, true);
    assert.deepEqual(report.blockers, []);
    assert.deepEqual(report.detection.plugin_inventory_ids, ['fixture.plugin fixture name']);
    assert.deepEqual(report.detection.skill_names, ['ordinary-skill', 'start-work', 'ulw-loop', 'ulw-plan']);
    assert.deepEqual(report.detection.preserved_skill_names, ['ulw-loop', 'ulw-plan', 'start-work']);
    assert.deepEqual(report.actions, [
      'preserve_existing_skill:ulw-loop',
      'preserve_existing_skill:ulw-plan',
      'preserve_existing_skill:start-work'
    ]);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('interop policy refuses symlinked and external report paths without touching the external tree', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-interop-report-confinement-'));
  const root = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  const outside = path.join(fixture, 'outside');
  const marker = path.join(outside, 'must-remain.txt');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    await Promise.all([
      fsp.mkdir(root, { recursive: true }),
      fsp.mkdir(home, { recursive: true }),
      fsp.mkdir(outside, { recursive: true })
    ]);
    await fsp.writeFile(marker, 'external tree must remain unchanged');
    await fsp.symlink(outside, path.join(root, '.sneakoscope'));
    const before = (await fsp.readdir(outside)).sort();

    const defaultReport = await buildCodexNativeInteropPolicy({
      root,
      inventory: { plugins: [], blockers: [] }
    });
    const externalReport = await buildCodexNativeInteropPolicy({
      root,
      inventory: { plugins: [], blockers: [] },
      reportPath: path.join(outside, 'custom-interop.json')
    });

    assert.equal(defaultReport.ok, false);
    assert.ok(defaultReport.blockers.includes('codex_native_interop_report_path_unsafe'));
    assert.equal(externalReport.ok, false);
    assert.ok(externalReport.blockers.includes('codex_native_interop_report_path_unsafe'));
    assert.deepEqual((await fsp.readdir(outside)).sort(), before);
    assert.equal(await fsp.readFile(marker, 'utf8'), 'external tree must remain unchanged');
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

function assertClosedReport(report: unknown, outside: string, externalSkillName: string): void {
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(outside), false);
  assert.equal(serialized.includes(SECRET_MARKER), false);
  assert.equal(serialized.includes(externalSkillName), false);
  const blockers = (report as { blockers: string[] }).blockers;
  assert.equal(blockers.some((blocker) => /[\r\n/\\]/.test(blocker)), false);
}

async function snapshotTree(root: string): Promise<string[]> {
  const rows: string[] = [];
  await walk(root, '');
  return rows;

  async function walk(current: string, relative: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = path.join(relative, entry.name);
      rows.push(`${entry.isDirectory() ? 'dir' : 'other'}:${childRelative}`);
      if (entry.isDirectory()) await walk(path.join(current, entry.name), childRelative);
    }
  }
}
