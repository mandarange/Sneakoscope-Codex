#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMadDbCapability, MAD_DB_ACK, readMadDbCapability } from '../core/mad-db/mad-db-capability.js'
import { checkDbOperation } from '../core/db-safety.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-bounded-'))
const missionId = 'M-mad-db-bounded'
const cap = await createMadDbCapability(root, { missionId, ack: MAD_DB_ACK, ttlMs: 60000 })
assertGate(cap.max_operations >= 2 && cap.operation_count === 0, 'capability must start as bounded one-cycle', cap)
const payload = { tool_name: 'supabase.execute_sql', sql: 'update users set flag = true where id = 1' }
const first = await checkDbOperation(root, { mission_id: missionId }, payload)
const second = await checkDbOperation(root, { mission_id: missionId }, payload)
const after = await readMadDbCapability(root, missionId)
assertGate(first.allowed === true && second.allowed === true, 'multiple operations in same Mad-DB cycle must be allowed under cap', { first, second })
assertGate(after.operation_count === 2 && after.consumed === false, 'capability should remain active until operation cap/close/expiry/revoke', after)
emitGate('mad-db:one-cycle-bounded', { cycle_id: cap.cycle_id, operation_count: after.operation_count, max_operations: after.max_operations })
