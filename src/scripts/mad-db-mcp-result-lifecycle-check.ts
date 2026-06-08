#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { checkDbOperation, madDbLifecycleHookFromDecision } from '../core/db-safety.js'
import { evaluateHookPayload } from '../core/hooks-runtime.js'
import { createMadDbCapability, MAD_DB_ACK } from '../core/mad-db/mad-db-capability.js'
import { missionDir } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-mcp-result-'))
const missionId = 'M-mad-db-mcp-result'
await createMadDbCapability(root, { missionId, ack: MAD_DB_ACK, ttlMs: 60000 })
const payload = { tool_name: 'supabase.execute_sql', sql: 'insert into audit_log(id) values (1)' }
const decision = await checkDbOperation(root, { mission_id: missionId }, payload)
const hook = madDbLifecycleHookFromDecision(decision)
assertGate(Boolean(hook), 'Mad-DB lifecycle hook missing before post-tool result', decision)
await evaluateHookPayload('post-tool', { tool_name: payload.tool_name, success: true, row_count: 1 }, { root, state: { mission_id: missionId } })
const ledger = await fs.readFile(path.join(missionDir(root, missionId), 'mad-db-ledger.jsonl'), 'utf8')
assertGate(ledger.includes('db_operation.succeeded') && !ledger.includes('db_operation.failed'), 'PostToolUse success must append succeeded lifecycle event', { ledger })
emitGate('mad-db:mcp-result-lifecycle', { operation_id: hook.operation_id, status: 'succeeded' })
