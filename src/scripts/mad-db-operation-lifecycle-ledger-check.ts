#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMadDbCapability, MAD_DB_ACK } from '../core/mad-db/mad-db-capability.js'
import { checkDbOperation } from '../core/db-safety.js'
import { createMission, missionDir } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-ledger-'))
const mission = await createMission(root, { mode: 'mad-db', prompt: 'ledger fixture' })
await createMadDbCapability(root, { missionId: mission.id, ack: MAD_DB_ACK, ttlMs: 60000, projectRef: 'fixture-project-ref', status: 'active' })
await checkDbOperation(root, { mission_id: mission.id }, { tool_name: 'supabase.execute_sql', tool_call_id: 'ledger-call-1', sql: 'insert into audit_log(id) values (1)' })
const ledger = await fs.readFile(path.join(missionDir(root, mission.id), 'mad-db-ledger.jsonl'), 'utf8')
assertGate(ledger.includes('db_operation.reserved') && ledger.includes('db_operation.started') && ledger.includes('db_mutation.allowed') && !ledger.includes('unknown_pending_tool_result'), 'Mad-DB lifecycle ledger events missing or pending-latest fallback still present', { ledger })
emitGate('mad-db:operation-lifecycle-ledger')
