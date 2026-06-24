#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMission } from '../core/mission.js'
import { createMadDbCapability, MAD_DB_ACK, readMadDbCapability } from '../core/mad-db/mad-db-capability.js'
import { reserveMadDbOperation, transitionMadDbOperation } from '../core/mad-db/mad-db-operation-store.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-db-parallel-lifecycle-'))
const mission = await createMission(root, { mode: 'mad-db', prompt: 'parallel lifecycle fixture' })
const cap = await createMadDbCapability(root, { missionId: mission.id, ack: MAD_DB_ACK, cwd: root, projectRef: 'fixture-project-ref', status: 'active' })
const [first, second] = await Promise.all([
  reserveMadDbOperation({ root, missionId: mission.id, capability: cap, toolCallId: 'parallel-call-a', toolName: 'supabase.execute_sql', sql: 'insert into fixture values (1)', operationClasses: ['insert'] }),
  reserveMadDbOperation({ root, missionId: mission.id, capability: cap, toolCallId: 'parallel-call-b', toolName: 'supabase.execute_sql', sql: 'update fixture set id = 2', operationClasses: ['all_row_update'] })
])

await Promise.all([
  transitionMadDbOperation({ root, missionId: mission.id, toolCallId: 'parallel-call-b', state: 'failed', errorCode: 'fixture_parallel_failure' }),
  transitionMadDbOperation({ root, missionId: mission.id, toolCallId: 'parallel-call-a', state: 'succeeded', result: { ok: true } })
])
const capAfter = await readMadDbCapability(root, mission.id)

assertGate(first.operation.operation_id !== second.operation.operation_id, 'parallel calls must not collide by tool name', { first, second })
assertGate(Boolean(capAfter) && capAfter!.counters.reserved === 2 && capAfter!.counters.succeeded === 1 && capAfter!.counters.failed === 1, 'parallel lifecycle counters must track exact call ids', capAfter || {})
emitGate('mad-db:parallel-lifecycle', { first: first.operation.operation_id, second: second.operation.operation_id, counters: capAfter!.counters })
