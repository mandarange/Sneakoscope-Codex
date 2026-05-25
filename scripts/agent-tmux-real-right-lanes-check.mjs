#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const tmux = await importDist('core/agents/agent-runner-tmux.js');
const cockpit = await importDist('core/agents/tmux-right-lane-cockpit.js');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-tmux-lanes-'));
const agent = { id: 'slot-001', slot_id: 'slot-001', generation_index: 1, session_id: 'agent_slot-001-gen_1', persona_id: 'verifier', session_artifact_dir: path.join('sessions', 'slot-001', 'gen-1') };
const result = await tmux.runTmuxAgent(agent, { id: 'work-001' }, { agentRoot: root, fakeTmux: true });
assertGate(result.status === 'done', 'tmux runner must record pane launch evidence', result);
const report = JSON.parse(await fs.readFile(path.join(root, agent.session_artifact_dir, 'agent-tmux-report.json'), 'utf8'));
assertGate(report.launch_mode !== 'optional_not_launched' && report.pane_id, 'tmux report must not be optional_not_launched', report);
const lanes = cockpit.buildTmuxRightLaneCockpit({ slots: [{ slot_id: 'slot-001', status: 'running', current_generation_index: 1, current_session_id: agent.session_id, pane_id: report.pane_id, history: [] }] });
assertGate(lanes.lanes.actual_pane_ids.length === 1, 'tmux lane manifest must include actual pane ids', lanes);
emitGate('agent:tmux-real-right-lanes', { pane_id: report.pane_id, launch_mode: report.launch_mode });
