#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeQaLoopArtifacts } from '../core/qa-loop.js'
import { createCodexNativeRuntimeFixture, withFixtureEnv } from './codex-native-runtime-e2e-fixture.js'

export async function runCodexNativeQaRoutingRealBlackbox(): Promise<void> {
  const ready = await qaScenario({ hook: 'approved', appHandoff: true })
  assertGate(ready.visual_review === 'codex-app-native', 'QA visual review should select app handoff when ready', ready)

  const unknownHook = await qaScenario({ hook: 'unknown', appHandoff: true })
  assertGate(unknownHook.hook_evidence_policy === 'unknown-do-not-count', 'unknown hook evidence must not count', unknownHook)
  assertGate(unknownHook.hook_derived_evidence_counted === false, 'unknown hook-derived evidence was counted', unknownHook)

  const noHandoff = await qaScenario({ hook: 'approved', appHandoff: false })
  assertGate(noHandoff.visual_review !== 'codex-app-native', 'QA must not falsely pass app handoff when unavailable', noHandoff)
  emitGate('pipeline:codex-native-qa-routing-real-blackbox')
}

async function qaScenario(input: { hook: 'approved' | 'unknown'; appHandoff: boolean }): Promise<Record<string, unknown>> {
  const fixture = await createCodexNativeRuntimeFixture({
    hook: input.hook,
    agentType: 'supported',
    appHandoff: input.appHandoff,
    imagePathExposure: true,
    mcpCandidates: true,
    codeModeWebSearch: true
  })
  return withFixtureEnv(fixture, async () => {
    const dir = path.join(fixture.root, '.sneakoscope', 'missions', fixture.missionId)
    await writeQaLoopArtifacts(dir, { id: fixture.missionId, prompt: 'QA visual fixture' }, {
      answers: {
        QA_SCOPE: 'ui_visual',
        TARGET_ENVIRONMENT: 'local_fixture',
        QA_MUTATION_POLICY: 'no_mutation'
      }
    })
    const artifact = JSON.parse(await fs.readFile(path.join(dir, 'qa-loop', 'codex-native-invocation.json'), 'utf8')) as Record<string, unknown>
    assertGate(artifact && typeof artifact === 'object', 'QA invocation artifact missing')
    return artifact
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await runCodexNativeQaRoutingRealBlackbox()

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
