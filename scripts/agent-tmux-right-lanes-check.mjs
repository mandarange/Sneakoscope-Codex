#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/tmux-right-lane-cockpit.js');
const cockpit = mod.buildTmuxRightLaneCockpit({ missionId: 'M-fixture', sessionName: 'sks-fixture', agents: Array.from({ length: 20 }, (_, index) => ({ id: `agent_${index + 1}`, role: 'verifier', status: 'running' })) });
assertGate(cockpit.layout.orchestrator_pane === 'left', 'orchestrator pane must be left');
assertGate(cockpit.layout.agent_lane_stack === 'right_vertical', 'agent lanes must be right vertical stack');
assertGate(cockpit.lanes.lane_count === 20 && cockpit.lanes.pagination.all_agents_indexed === true, '20 agents must be indexed in right lanes');
emitGate('agent:tmux-right-lanes', { lane_count: cockpit.lanes.lane_count, attach: cockpit.layout.attach_command });
