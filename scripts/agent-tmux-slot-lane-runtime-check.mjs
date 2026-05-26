#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const supervisorMod = await importDist('core/agents/tmux-lane-supervisor.js');
const tmuxMod = await importDist('core/agents/agent-runner-tmux.js');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-slot-lane-runtime-'));
await supervisorMod.initializeTmuxLaneSupervisor(root, { missionId: 'M-slot-lane', targetActiveSlots: 1, sessionName: 'sks-M-slot-lane' });
const first = { id: 'slot-001', slot_id: 'slot-001', generation_index: 1, session_id: 'slot-001-gen-1', persona_id: 'verifier', session_artifact_dir: path.join('sessions', 'slot-001', 'gen-1') };
const second = { ...first, generation_index: 2, session_id: 'slot-001-gen-2', session_artifact_dir: path.join('sessions', 'slot-001', 'gen-2') };
const r1 = await tmuxMod.runTmuxAgent(first, { id: 'work-001' }, { agentRoot: root, fakeTmux: true });
const r2 = await tmuxMod.runTmuxAgent(second, { id: 'work-002' }, { agentRoot: root, fakeTmux: true });
assertGate(r1.status === 'done' && r2.status === 'done', 'tmux runner must record persistent lane evidence', { r1, r2 });
const ledger = (await fs.readFile(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), 'utf8')).trim().split(/\n+/).map((line) => JSON.parse(line));
const generations = ledger.filter((row) => row.session_id).map((row) => row.generation_index);
const paneIds = new Set(ledger.filter((row) => row.session_id).map((row) => row.pane_id));
assertGate(generations.includes(1) && generations.includes(2), 'tmux ledger must record both generations', ledger);
assertGate(paneIds.size === 1, 'tmux generations must reuse the same slot pane id', ledger);
assertGate(ledger.every((row) => row.persistent_slot_lane === true || row.launched_by === 'sks.tmux-lane-supervisor.v1'), 'tmux lane evidence must be slot-level persistent', ledger);
emitGate('agent:tmux-slot-lane-runtime', { pane_id: [...paneIds][0], generations });
