#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMission, setCurrent, missionDir } from '../core/mission.js'
import { checkDbOperation } from '../core/db-safety.js'
import { createMadDbCapability, MAD_DB_ACK, readMadDbCapability } from '../core/mad-db/mad-db-capability.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-db-direct-apply-'))
const mission = await createMission(root, { mode: 'mad-db', prompt: '$MAD-DB direct apply_migration fixture' })
const capability = await createMadDbCapability(root, {
  missionId: mission.id,
  ack: MAD_DB_ACK,
  cwd: root,
  ttlMs: 60000,
  projectRef: 'fixture-project-ref',
  status: 'active'
})
await setCurrent(root, {
  mission_id: mission.id,
  mode: 'MADDB',
  route: 'MadDB',
  route_command: '$MAD-DB',
  phase: 'MADDB_SQL_PLANE_CAPABILITY_ACTIVE',
  implementation_allowed: true,
  mad_db_active: true,
  mad_db_capability_mission_id: mission.id,
  mad_db_cycle_id: capability.cycle_id,
  mad_db_runtime_session_id: capability.runtime_session_id,
  mad_db_profile_sha256: capability.transport.profile_sha256,
  mad_db_capability_file: 'mad-db-capability.json'
})

const payloadStateFromCodex = { mission_id: 'codex-payload-state', mode: 'AGENT', phase: 'TOOL_CALL' }
const decision: any = await checkDbOperation(root, payloadStateFromCodex, {
  tool_name: 'mcp__supabase__apply_migration',
  tool_call_id: 'direct-apply-migration-call',
  tool_input: {
    name: 'direct_apply_fixture',
    query: 'alter table public.fixture add column if not exists direct_apply_fixture text;'
  }
})
const updated = await readMadDbCapability(root, mission.id)
const wrongMissionDirExists = fs.existsSync(missionDir(root, payloadStateFromCodex.mission_id))

assertGate(decision.allowed === true && decision.mad_db?.active === true, 'direct Supabase MCP apply_migration must be allowed by persisted active MadDB capability', decision)
assertGate(decision.mad_db.operation_classes.includes('migration_apply'), 'direct apply_migration must reserve a migration_apply operation class', decision)
assertGate(decision.mad_db.state_source === 'persisted_sks_state', 'drifted hook payload state must fall back to persisted SKS MadDB state', decision)
assertGate(updated?.counters.reserved === 1, 'direct apply_migration reservation must land on the real MadDB mission capability', updated || {})
assertGate(wrongMissionDirExists === false, 'direct apply_migration must not create or write under the drifted payload mission id')

const unrelatedMission = await createMission(root, { mode: 'team', prompt: 'unrelated current-state drift fixture' })
const unrelatedStateFromCodex = { mission_id: unrelatedMission.id, mode: 'TEAM', phase: 'TOOL_CALL' }
const executeDecision: any = await checkDbOperation(root, unrelatedStateFromCodex, {
  tool_name: 'mcp__supabase__execute_sql',
  tool_call_id: 'direct-execute-sql-drop-delete-call',
  tool_input: {
    query: 'drop table if exists public.fixture_old; delete from public.fixture;'
  }
})
const afterExecute = await readMadDbCapability(root, mission.id)
const unrelatedOperationsDir = path.join(missionDir(root, unrelatedMission.id), 'mad-db', 'runtime', 'operations')

assertGate(executeDecision.allowed === true && executeDecision.mad_db?.active === true, 'active MadDB capability must allow direct execute_sql after current state drifts away from MadDB', executeDecision)
assertGate(executeDecision.mad_db.state_source === 'latest_active_mad_db_capability', 'direct execute_sql must fall back to the latest active MadDB capability when persisted state is unrelated', executeDecision)
for (const operation of ['direct_execute_sql', 'drop', 'all_row_delete']) {
  assertGate(executeDecision.mad_db.operation_classes.includes(operation), `direct execute_sql destructive SQL must reserve ${operation}`, executeDecision)
}
assertGate(afterExecute?.counters.reserved === 2, 'direct execute_sql reservation must land on the real MadDB mission capability', afterExecute || {})
assertGate(fs.existsSync(unrelatedOperationsDir) === false, 'direct execute_sql must not write operation lifecycle files under the unrelated current mission')

emitGate('mad-db:direct-apply-migration-hook', {
  mission_id: mission.id,
  apply_operation_id: decision.mad_db.operation_id,
  execute_operation_id: executeDecision.mad_db.operation_id,
  counters: afterExecute?.counters
})
