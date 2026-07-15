#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMission } from '../core/mission.js'
import { createMadSksSqlPlaneCapability, MAD_SKS_SQL_PLANE_ACK, readMadSksSqlPlaneCapability } from '../core/mad-sks/sql-plane/capability.js'
import { reserveMadSksSqlPlaneOperation, transitionMadSksSqlPlaneOperation } from '../core/mad-sks/sql-plane/operation-store.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-mad-sks-sql-plane-parallel-lifecycle-'))
const mission = await createMission(root, { mode: 'mad-sks', prompt: 'parallel lifecycle fixture' })
const cap = await createMadSksSqlPlaneCapability(root, { missionId: mission.id, ack: MAD_SKS_SQL_PLANE_ACK, cwd: root, projectRef: 'fixture-project-ref', status: 'active' })
const [first, second] = await Promise.all([
  reserveMadSksSqlPlaneOperation({ root, missionId: mission.id, capability: cap, toolCallId: 'parallel-call-a', toolName: 'supabase.execute_sql', sql: 'insert into fixture values (1)', operationClasses: ['insert'] }),
  reserveMadSksSqlPlaneOperation({ root, missionId: mission.id, capability: cap, toolCallId: 'parallel-call-b', toolName: 'supabase.execute_sql', sql: 'update fixture set id = 2', operationClasses: ['all_row_update'] })
])

await Promise.all([
  transitionMadSksSqlPlaneOperation({ root, missionId: mission.id, toolCallId: 'parallel-call-b', state: 'failed', errorCode: 'fixture_parallel_failure' }),
  transitionMadSksSqlPlaneOperation({ root, missionId: mission.id, toolCallId: 'parallel-call-a', state: 'succeeded', result: { ok: true } })
])
const capAfter = await readMadSksSqlPlaneCapability(root, mission.id)

assertGate(first.operation.operation_id !== second.operation.operation_id, 'parallel calls must not collide by tool name', { first, second })
assertGate(Boolean(capAfter) && capAfter!.counters.reserved === 2 && capAfter!.counters.succeeded === 1 && capAfter!.counters.failed === 1, 'parallel lifecycle counters must track exact call ids', capAfter || {})
emitGate('mad-sks-sql-plane:parallel-lifecycle', { first: first.operation.operation_id, second: second.operation.operation_id, counters: capAfter!.counters })
