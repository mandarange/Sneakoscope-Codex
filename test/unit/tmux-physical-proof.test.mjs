import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('tmux physical proof requires list-panes and capture content in real mode', async () => {
  const mod = await import('../../dist/core/agents/tmux-physical-proof.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tmux-proof-test-'));
  await fs.mkdir(path.join(root, 'lanes', 'slot-001'), { recursive: true });
  await fs.writeFile(path.join(root, 'agent-tmux-lane-supervisor.json'), JSON.stringify({
    lanes: [{ slot_id: 'slot-001', pane_id: '%101', lane_md: 'lanes/slot-001/lane.md', current_generation_index: 1, drained: false }]
  }));
  await fs.writeFile(path.join(root, 'lanes', 'slot-001', 'lane.md'), 'slot-001\ngeneration: 1\nqueue: 1 pending\n');
  const proof = await mod.buildTmuxPhysicalProof(root, {
    realTmux: true,
    required: true,
    listPanesText: 's\t0\t1\t%101\t0\tsh\n',
    captureByPaneId: { '%101': 'slot-001\ngeneration: 1\nqueue: 1 pending\n' },
    writeArtifacts: false
  });
  assert.equal(proof.physical_tmux_verified, true);
});
