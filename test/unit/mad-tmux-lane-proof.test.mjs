import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('MAD tmux lane proof records visible lane contract', async () => {
  const mod = await import('../../dist/core/mad-sks/mad-tmux-lane-proof.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-lane-proof-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-mad-lane');
  await fs.mkdir(missionDir, { recursive: true });
  const proof = await mod.writeMadSksTmuxLaneProof({
    root,
    missionDir,
    missionId: 'M-mad-lane',
    required: true,
    launch: {
      created: true,
      session: 'sks-mad-fixture',
      list_panes_rows: [{ session_name: 'sks-mad-fixture', pane_id: '%1', pane_current_command: 'codex' }]
    }
  });
  assert.equal(proof.schema, 'sks.mad-sks-tmux-lane-ui.v1');
  assert.equal(proof.proof_level, 'proven');
  assert.equal(proof.visible_lane_contract, true);
});
