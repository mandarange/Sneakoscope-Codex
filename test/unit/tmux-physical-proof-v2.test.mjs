import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('tmux physical proof v2 writes phase artifacts and summary', async () => {
  const mod = await import('../../dist/core/agents/tmux-physical-proof.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tmux-v2-test-'));
  await fs.mkdir(path.join(root, 'lanes', 'slot-001'), { recursive: true });
  await fs.writeFile(path.join(root, 'agent-tmux-lane-supervisor.json'), JSON.stringify({
    mission_id: 'fixture',
    lanes: [{ slot_id: 'slot-001', pane_id: '%101', lane_md: 'lanes/slot-001/lane.md', current_generation_index: 1 }]
  }));
  await fs.writeFile(path.join(root, 'agent-tmux-lanes.json'), JSON.stringify({ lanes: [{ slot_id: 'slot-001', pane_id: '%101' }] }));
  await fs.writeFile(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), `${JSON.stringify({ slot_id: 'slot-001', pane_id: '%101' })}\n`);
  await fs.writeFile(path.join(root, 'lanes', 'slot-001', 'lane.md'), 'slot-001\ngeneration: 1\nqueue: 1 pending\n');
  const opts = {
    realTmux: true,
    required: true,
    listPanesText: 's\t0\t1\t%101\t0\tsh\n',
    captureByPaneId: { '%101': 'slot-001\ngeneration: 1\nqueue: 1 pending\n' }
  };
  const before = await mod.writeTmuxPhysicalProof(root, { ...opts, phase: 'before_drain' });
  await mod.writeTmuxPhysicalProof(root, { ...opts, phase: 'after_drain' });
  await mod.writeTmuxPhysicalProof(root, { ...opts, phase: 'final' });
  const summary = JSON.parse(await fs.readFile(path.join(root, 'agent-tmux-physical-proof-summary.json'), 'utf8'));
  assert.equal(before.schema, 'sks.tmux-physical-proof.v2');
  assert.ok(summary.phases.before_drain);
  assert.ok(summary.phases.after_drain);
  assert.ok(summary.phases.final);
});

test('tmux physical proof v2 accepts drained final panes missing from list-panes', async () => {
  const mod = await import('../../dist/core/agents/tmux-physical-proof.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tmux-v2-drained-test-'));
  await fs.writeFile(path.join(root, 'agent-tmux-lane-supervisor.json'), JSON.stringify({
    mission_id: 'fixture',
    lanes: [{
      slot_id: 'slot-001',
      pane_id: '%202',
      current_generation_index: null,
      drained: true,
      closed_at: '2026-05-26T00:00:00.000Z'
    }]
  }));
  await fs.writeFile(path.join(root, 'agent-tmux-lanes.json'), JSON.stringify({ lanes: [{ slot_id: 'slot-001', pane_id: '%202' }] }));
  await fs.writeFile(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), `${JSON.stringify({ slot_id: 'slot-001', pane_id: '%202' })}\n`);

  const proof = await mod.writeTmuxPhysicalProof(root, {
    realTmux: true,
    required: true,
    phase: 'final',
    listPanesText: ''
  });

  assert.equal(proof.status, 'passed');
  assert.equal(proof.physical_tmux_verified, true);
  assert.equal(proof.reconciliation.records[0].drain_state, 'closed_or_drained');
  assert.equal(proof.reconciliation.records[0].list_panes_contains_supervisor_pane, false);
});
