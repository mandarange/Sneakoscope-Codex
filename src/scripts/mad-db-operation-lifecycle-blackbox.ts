#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { checkDbOperation, madDbLifecycleHookFromDecision } from '../core/db-safety.js'
import { createMadDbCapability, MAD_DB_ACK } from '../core/mad-db/mad-db-capability.js'
import { recordMadDbToolResult } from '../core/mad-db/mad-db-result-lifecycle.js'
import { missionDir } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-lifecycle-blackbox-'))
const missionId = 'M-mad-db-lifecycle-blackbox'
await createMadDbCapability(root, { missionId, ack: MAD_DB_ACK, ttlMs: 60000 })

const success = await checkDbOperation(root, { mission_id: missionId }, { tool_name: 'supabase.execute_sql', sql: 'insert into audit_log(id) values (1)' })
const successHook = madDbLifecycleHookFromDecision(success)
assertGate(Boolean(successHook), 'success hook missing', success)
await recordMadDbToolResult({ root, missionId, hook: successHook, ok: true, rowCount: 1 })

const failure = await checkDbOperation(root, { mission_id: missionId }, { tool_name: 'supabase.execute_sql', sql: 'update users set flag = true where id = 1' })
const failureHook = madDbLifecycleHookFromDecision(failure)
assertGate(Boolean(failureHook), 'failure hook missing', failure)
await recordMadDbToolResult({ root, missionId, hook: failureHook, ok: false, error: 'fixture failure' })

const ledger = await fs.readFile(path.join(missionDir(root, missionId), 'mad-db-ledger.jsonl'), 'utf8')
for (const token of ['db_operation.started', 'db_operation.allowed', 'db_operation.succeeded', 'db_operation.failed']) {
  assertGate(ledger.includes(token), `Mad-DB ledger missing ${token}`, { ledger })
}
assertGate((ledger.match(/db_operation\.succeeded/g) || []).length === 1, 'success terminal event must be recorded exactly once', { ledger })
assertGate((ledger.match(/db_operation\.failed/g) || []).length === 1, 'failure terminal event must be recorded exactly once', { ledger })
emitGate('mad-db:operation-lifecycle-blackbox', { succeeded: successHook.operation_id, failed: failureHook.operation_id })
