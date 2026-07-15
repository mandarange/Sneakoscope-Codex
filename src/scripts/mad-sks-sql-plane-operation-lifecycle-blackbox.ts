#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { checkDbOperation, madSksSqlPlaneLifecycleHookFromDecision } from '../core/db-safety.js'
import { createMadSksSqlPlaneCapability, MAD_SKS_SQL_PLANE_ACK } from '../core/mad-sks/sql-plane/capability.js'
import { recordMadSksSqlPlaneToolResult } from '../core/mad-sks/sql-plane/result-lifecycle.js'
import { createMission, missionDir } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-lifecycle-blackbox-'))
const mission = await createMission(root, { mode: 'mad-sks', prompt: 'lifecycle blackbox fixture' })
await createMadSksSqlPlaneCapability(root, { missionId: mission.id, ack: MAD_SKS_SQL_PLANE_ACK, ttlMs: 60000, projectRef: 'fixture-project-ref', status: 'active' })

const success = await checkDbOperation(root, { mission_id: mission.id }, { tool_name: 'supabase.execute_sql', tool_call_id: 'blackbox-success-call', sql: 'insert into audit_log(id) values (1)' })
const successHook = madSksSqlPlaneLifecycleHookFromDecision(success)
assertGate(Boolean(successHook), 'success hook missing', success)
await recordMadSksSqlPlaneToolResult({ root, missionId: mission.id, hook: successHook, ok: true, rowCount: 1 })

const failure = await checkDbOperation(root, { mission_id: mission.id }, { tool_name: 'supabase.execute_sql', tool_call_id: 'blackbox-failure-call', sql: 'update users set flag = true where id = 1' })
const failureHook = madSksSqlPlaneLifecycleHookFromDecision(failure)
assertGate(Boolean(failureHook), 'failure hook missing', failure)
await recordMadSksSqlPlaneToolResult({ root, missionId: mission.id, hook: failureHook, ok: false, error: 'fixture failure' })

const ledger = await fs.readFile(path.join(missionDir(root, mission.id), 'mad-sks', 'sql-plane', 'ledger.jsonl'), 'utf8')
for (const token of ['db_operation.started', 'db_mutation.allowed', 'db_operation.succeeded', 'db_operation.failed']) {
  assertGate(ledger.includes(token), `MAD-SKS SQL-plane ledger missing ${token}`, { ledger })
}
assertGate((ledger.match(/db_operation\.succeeded/g) || []).length === 1, 'success terminal event must be recorded exactly once', { ledger })
assertGate((ledger.match(/db_operation\.failed/g) || []).length === 1, 'failure terminal event must be recorded exactly once', { ledger })
emitGate('mad-sks-sql-plane:operation-lifecycle-blackbox', { succeeded: successHook.operation_id, failed: failureHook.operation_id })
