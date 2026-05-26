#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, root } from './sks-1-18-gate-lib.mjs';
import { runActualAgentBackfillBlackbox } from './agent-route-blackbox-lib.mjs';

const run = runActualAgentBackfillBlackbox('agent:tmux-supervisor-integrated');
const latest = missionDir(run?.mission_id);
const agentsRoot = path.join(latest, 'agents');
const supervisor = readJson(path.join(agentsRoot, 'agent-tmux-lane-supervisor.json'));
const events = fs.readFileSync(path.join(agentsRoot, 'agent-tmux-lane-supervisor-events.jsonl'), 'utf8');
assertGate(supervisor.schema === 'sks.tmux-lane-supervisor.v1', 'tmux supervisor schema missing', supervisor);
assertGate(supervisor.lane_count === 5, 'tmux supervisor lane count must match target active slots', supervisor);
assertGate(events.includes('lane_supervisor_initialized'), 'tmux supervisor init event missing', { events });
assertGate(events.includes('lane_supervisor_drained'), 'tmux supervisor drain event missing', { events });

function missionDir(missionId) {
  assertGate(Boolean(missionId), 'tmux supervisor check did not return a mission id', run || {});
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  assertGate(fs.existsSync(dir), 'tmux supervisor mission directory missing', { mission_id: missionId });
  return dir;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
