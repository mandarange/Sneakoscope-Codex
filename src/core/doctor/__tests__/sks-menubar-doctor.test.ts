import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planDoctorDirtyRepair, markDoctorPhaseClean } from '../doctor-dirty-planner.js';
import { runDoctorFixTransaction } from '../doctor-transaction.js';

test('doctor menubar phase treats undefined ok as failed, even though optional for ready', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-menubar-phase-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const transaction = await runDoctorFixTransaction({
    root,
    reportPath: null,
    phases: [{
      id: 'sks_menubar',
      required_for_ready: false,
      run: async () => ({
        id: 'sks_menubar',
        ok: undefined as unknown as boolean,
        required_for_ready: false,
        warnings: ['synthetic_undefined_ok']
      })
    }]
  });

  const phase = transaction.phases.find((entry) => entry.id === 'sks_menubar');
  assert.equal(phase?.ok, false);
  assert.equal(phase?.required_for_ready, false);
  assert.equal(transaction.ok, true);
});

test('doctor dirty planner marks menubar dirty when runtime probe fails despite clean marker', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-menubar-dirty-'));
  const previousHome = process.env.HOME;
  process.env.HOME = path.join(root, 'home');
  await fs.mkdir(process.env.HOME, { recursive: true });
  t.after(async () => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await fs.rm(root, { recursive: true, force: true });
  });

  const proofId = markDoctorPhaseClean(root, 'sks_menubar', 'doctor-sks-menubar-clean-fixture', true);
  await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'doctor-fix-transaction.json'), JSON.stringify({ proof_ids_used: [proofId] }), 'utf8');
  const plan = planDoctorDirtyRepair(root, ['sks_menubar']);
  const phase = plan.phases.find((entry) => entry.id === 'sks_menubar');
  if (process.platform === 'darwin') {
    assert.equal(phase?.status, 'dirty');
    assert.match(phase?.reason || '', /runtime_probe_failed/);
    assert.equal(plan.runtime_probe_failed.some((entry) => entry.startsWith('sks_menubar:')), true);
  } else {
    assert.equal(phase?.status, 'clean');
    assert.deepEqual(plan.runtime_probe_failed, []);
  }
});
