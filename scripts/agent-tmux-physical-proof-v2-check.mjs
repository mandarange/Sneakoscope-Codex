#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/tmux-physical-proof.js');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tmux-proof-v2-'));
await fs.mkdir(path.join(root, 'lanes', 'slot-001'), { recursive: true });
await fs.writeFile(path.join(root, 'agent-tmux-lane-supervisor.json'), JSON.stringify({
  schema: 'sks.tmux-lane-supervisor.v1',
  mission_id: 'fixture',
  lanes: [{ slot_id: 'slot-001', pane_id: '%101', lane_md: 'lanes/slot-001/lane.md', current_generation_index: 3, drained: false, closed_at: null }]
}, null, 2));
await fs.writeFile(path.join(root, 'agent-tmux-lanes.json'), JSON.stringify({ lanes: [{ slot_id: 'slot-001', pane_id: '%101' }] }, null, 2));
await fs.writeFile(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), `${JSON.stringify({ slot_id: 'slot-001', pane_id: '%101' })}\n`);
await fs.writeFile(path.join(root, 'lanes', 'slot-001', 'lane.md'), '# slot-001\npane: %101\ngeneration: 3\nqueue: 1 pending / 1 completed\n');
const opts = {
  missionId: 'fixture',
  realTmux: true,
  required: true,
  listPanesText: 'sks-fixture\t0\t1\t%101\t0\tsh\n',
  captureByPaneId: { '%101': '# slot-001\npane: %101\ngeneration: 3\nqueue: 1 pending / 1 completed\n' }
};
const before = await mod.writeTmuxPhysicalProof(root, { ...opts, phase: 'before_drain' });
const after = await mod.writeTmuxPhysicalProof(root, { ...opts, phase: 'after_drain' });
const final = await mod.writeTmuxPhysicalProof(root, { ...opts, phase: 'final' });
const summary = JSON.parse(await fs.readFile(path.join(root, 'agent-tmux-physical-proof-summary.json'), 'utf8'));

assertGate(before.schema === 'sks.tmux-physical-proof.v2', 'tmux physical proof schema must be v2', before);
assertGate(before.reconciliation.schema === 'sks.tmux-pane-reconciliation.v2', 'tmux pane reconciliation schema must be v2', before.reconciliation);
assertGate(before.lane_content_truth.schema === 'sks.tmux-lane-content-truth.v2', 'lane content truth schema must be v2', before.lane_content_truth);
assertGate(after.phase === 'after_drain' && final.phase === 'final', 'phase-specific proof artifacts must preserve phase');
assertGate(summary.phases.before_drain && summary.phases.after_drain && summary.phases.final, 'summary must link before/after/final phase artifacts', summary);
assertGate(before.reconciliation.per_slot_status.length === 1 && before.reconciliation.per_generation_status.length === 1, 'reconciliation v2 must include per-slot and per-generation status', before.reconciliation);

emitGate('agent:tmux-physical-proof-v2', { phases: Object.keys(summary.phases).filter((key) => summary.phases[key]).length });
