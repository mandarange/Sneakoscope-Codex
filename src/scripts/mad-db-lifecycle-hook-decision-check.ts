#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { checkDbOperation, madDbLifecycleHookFromDecision } from '../core/db-safety.js'
import { createMadDbCapability, MAD_DB_ACK } from '../core/mad-db/mad-db-capability.js'
import { createMission } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-hook-decision-'))
const mission = await createMission(root, { mode: 'mad-db', prompt: 'hook fixture' })
await createMadDbCapability(root, { missionId: mission.id, ack: MAD_DB_ACK, ttlMs: 60000, projectRef: 'fixture-project-ref', status: 'active' })
const decision = await checkDbOperation(root, { mission_id: mission.id }, { tool_name: 'supabase.execute_sql', tool_call_id: 'hook-decision-call-1', sql: 'insert into audit_log(id) values (1)' })
const hook = madDbLifecycleHookFromDecision(decision)
assertGate(decision.allowed === true && decision.mad_db?.lifecycle_result_pending === true, 'Mad-DB decision must mark pending lifecycle result', decision)
assertGate(Boolean(hook?.mission_id === mission.id && hook?.operation_id && hook?.tool_call_id === 'hook-decision-call-1' && hook?.cycle_id && hook?.tool_name), 'Mad-DB decision must expose canonical tool_call_id ledger result hook', { decision, hook })
emitGate('mad-db:lifecycle-hook-decision', { operation_id: hook.operation_id, cycle_id: hook.cycle_id })
