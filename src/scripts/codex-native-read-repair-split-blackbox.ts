#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildCodexNativeFeatureMatrix } from '../core/codex-native/codex-native-feature-broker.js'
import { repairCodexNativeManagedAssets } from '../core/codex-native/codex-native-repair-transaction.js'
import { createCodexNativeRuntimeFixture, withFixtureEnv } from './codex-native-runtime-e2e-fixture.js'

const fixture = await createCodexNativeRuntimeFixture({
  hook: 'approved',
  agentType: 'supported',
  appHandoff: true,
  imagePathExposure: true,
  mcpCandidates: true,
  codeModeWebSearch: true
})
const previous = process.env.CODEX_HOME
process.env.CODEX_HOME = path.join(fixture.root, 'codex-home')
try {
  await withFixtureEnv(fixture, async () => {
    await buildCodexNativeFeatureMatrix({ root: fixture.root, mode: 'read-only' })
    assertGate(!(await exists(path.join(fixture.root, 'codex-home', 'skills'))), 'read-only matrix created skills')
    assertGate(!(await exists(path.join(fixture.root, 'codex-home', 'agents'))), 'read-only matrix created agent roles')
    const repair = await repairCodexNativeManagedAssets({ root: fixture.root, requestedBy: 'manual', yes: true })
    assertGate(repair.repaired.some((row) => row.asset === 'skills'), 'repair transaction did not include skills', repair)
    assertGate(await exists(path.join(fixture.root, 'codex-home', 'skills')), 'repair transaction did not create managed skills')
    assertGate(await exists(path.join(fixture.root, '.codex', 'agents', 'worker.toml')) && await exists(path.join(fixture.root, '.codex', 'agents', 'expert.toml')), 'repair transaction did not create official project agent roles')
    assertGate(!(await exists(path.join(fixture.root, 'codex-home', 'agents'))), 'repair transaction created legacy global agent roles')
    const matrixAfter = await buildCodexNativeFeatureMatrix({ root: fixture.root, mode: 'read-only' })
    assertGate(matrixAfter.features.skill_sync.ok === true || matrixAfter.features.agent_roles.ok === true, 'post-repair read-only matrix did not reflect managed assets', matrixAfter)
  })
} finally {
  if (previous === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = previous
}
emitGate('codex-native:read-repair-split-blackbox')

async function exists(file: string): Promise<boolean> {
  try {
    await fs.stat(file)
    return true
  } catch {
    return false
  }
}

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
