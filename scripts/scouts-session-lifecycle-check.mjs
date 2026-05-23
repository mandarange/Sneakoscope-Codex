#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertCondition, root, runFiveScoutFixture, scoutRoleResults, unique, writeReport } from './scouts-1-14-1-lib.mjs';

const blockers = [];
const run = await runFiveScoutFixture({ engine: 'local-static', mock: true, writeCanonical: true, mode: 'session-lifecycle' });
const roles = await scoutRoleResults(run.mission_id);
const sessionIds = unique(roles.map((result) => result?.scout_session_id));

assertCondition(sessionIds.length === 5, blockers, 'scout_session_ids_not_unique');
for (const result of roles) {
  assertCondition(result?.engine_run_id === run.engine_run_id, blockers, `${result?.scout_id || 'unknown'}:engine_run_id_missing`);
  assertCondition(result?.session_lifecycle?.status === 'completed', blockers, `${result?.scout_id || 'unknown'}:lifecycle_status_not_completed`);
  assertCondition(result?.session_lifecycle?.timeout === false, blockers, `${result?.scout_id || 'unknown'}:timeout_not_false`);
}

const tmuxSource = fs.readFileSync(path.join(root, 'src/core/scouts/engines/tmux-lane-engine.ts'), 'utf8');
for (const token of ['socket_name', 'pane_id', 'command', 'stdout_file', 'stderr_file', 'started_at']) {
  assertCondition(tmuxSource.includes(token), blockers, `tmux_lifecycle_token_missing:${token}`);
}

await writeReport('scouts-session-lifecycle.json', {
  schema: 'sks.scouts-session-lifecycle.v1',
  ok: blockers.length === 0,
  mission_id: run.mission_id,
  engine_run_id: run.engine_run_id,
  scout_session_ids: sessionIds,
  blockers
});
