#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/tmux-physical-proof.js');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tmux-content-'));
await fs.mkdir(path.join(root, 'lanes', 'slot-001'), { recursive: true });
await fs.writeFile(path.join(root, 'agent-tmux-lane-supervisor.json'), JSON.stringify({
  schema: 'sks.tmux-lane-supervisor.v1',
  mission_id: 'fixture',
  lanes: [{ slot_id: 'slot-001', pane_id: '%101', lane_md: 'lanes/slot-001/lane.md', current_generation_index: 2, drained: false, closed_at: null }]
}, null, 2));
await fs.writeFile(path.join(root, 'lanes', 'slot-001', 'lane.md'), '# slot-001\npane: %101\ngeneration: 2\nqueue: 1 pending / 1 completed\n');
const proof = await mod.buildTmuxPhysicalProof(root, {
  realTmux: true,
  required: true,
  listPanesText: 'sks-fixture\t0\t1\t%101\t0\tsh\n',
  captureByPaneId: { '%101': '# slot-001\npane: %101\ngeneration: 2\nqueue: 1 pending / 1 completed\n' },
  writeArtifacts: false
});
assertGate(proof.lane_content_truth.ok === true, 'lane content truth positive fixture failed', proof.lane_content_truth);
const stale = await mod.buildTmuxPhysicalProof(root, {
  realTmux: true,
  required: true,
  listPanesText: 'sks-fixture\t0\t1\t%101\t0\tsh\n',
  captureByPaneId: { '%101': 'stale unrelated pane output\n' },
  writeArtifacts: false
});
assertGate(stale.lane_content_truth.ok === false, 'stale capture content must block lane truth', stale.lane_content_truth);
emitGate('agent:tmux-lane-content-truth', { capture_count: proof.tmux_capture_pane_artifacts.length, stale_blockers: stale.lane_content_truth.blockers.length });
