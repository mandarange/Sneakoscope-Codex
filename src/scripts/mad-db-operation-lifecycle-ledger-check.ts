#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMadDbCapability, MAD_DB_ACK } from '../core/mad-db/mad-db-capability.js'
import { checkDbOperation } from '../core/db-safety.js'
import { missionDir } from '../core/mission.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-ledger-'))
const missionId = 'M-mad-db-ledger'
await createMadDbCapability(root, { missionId, ack: MAD_DB_ACK, ttlMs: 60000 })
await checkDbOperation(root, { mission_id: missionId }, { tool_name: 'supabase.execute_sql', sql: 'insert into audit_log(id) values (1)' })
const ledger = await fs.readFile(path.join(missionDir(root, missionId), 'mad-db-ledger.jsonl'), 'utf8')
assertGate(ledger.includes('db_operation.started') && ledger.includes('db_operation.allowed') && ledger.includes('unknown_pending_tool_result'), 'Mad-DB lifecycle ledger events missing', { ledger })
emitGate('mad-db:operation-lifecycle-ledger')
