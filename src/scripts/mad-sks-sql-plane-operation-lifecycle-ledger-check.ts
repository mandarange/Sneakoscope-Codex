#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMadSksSqlPlaneCapability, MAD_SKS_SQL_PLANE_ACK } from '../core/mad-sks/sql-plane/capability.js'
import { checkDbOperation } from '../core/db-safety.js'
import { createMission, missionDir } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-ledger-'))
const mission = await createMission(root, { mode: 'mad-sks', prompt: 'ledger fixture' })
await createMadSksSqlPlaneCapability(root, { missionId: mission.id, ack: MAD_SKS_SQL_PLANE_ACK, ttlMs: 60000, projectRef: 'fixture-project-ref', status: 'active' })
await checkDbOperation(root, { mission_id: mission.id }, { tool_name: 'supabase.execute_sql', tool_call_id: 'ledger-call-1', sql: 'insert into audit_log(id) values (1)' })
const ledger = await fs.readFile(path.join(missionDir(root, mission.id), 'mad-sks', 'sql-plane', 'ledger.jsonl'), 'utf8')
assertGate(ledger.includes('db_operation.reserved') && ledger.includes('db_operation.started') && ledger.includes('db_mutation.allowed') && !ledger.includes('unknown_pending_tool_result'), 'MAD-SKS SQL-plane lifecycle ledger events missing or pending-latest fallback still present', { ledger })
emitGate('mad-sks-sql-plane:operation-lifecycle-ledger')
