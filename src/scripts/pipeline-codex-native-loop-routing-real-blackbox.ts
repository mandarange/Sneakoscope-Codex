#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { planLoopsFromRequest } from '../core/loops/loop-planner.js'
import { runLoopMakerWorkers } from '../core/loops/loop-worker-runtime.js'
import { resolveCodexNativeInvocationPlan } from '../core/codex-native/codex-native-invocation-router.js'
import { createCodexNativeRuntimeFixture, withFixtureEnv } from './codex-native-runtime-e2e-fixture.js'

export async function runCodexNativeLoopRoutingRealBlackbox(): Promise<void> {
  const supported = await createCodexNativeRuntimeFixture({
    hook: 'approved',
    agentType: 'supported',
    appHandoff: true,
    imagePathExposure: true,
    mcpCandidates: true,
    codeModeWebSearch: true
  })
  await withFixtureEnv(supported, async () => {
    const plan = await planLoopsFromRequest({
      root: supported.root,
      missionId: supported.missionId,
      request: 'change loop runtime fixture',
      sourceCommand: 'loop',
      maxLoops: 1
    })
    const node = plan.graph.nodes.find((row) => row.route !== '$Integration')
    assertGate(node, 'loop action node missing')
    const result = await runLoopMakerWorkers({ root: supported.root, plan, node, fixture: true })
    assertGate(result.codex_native_invocation_plan?.selected_strategy === 'codex-app-native', 'loop fixture did not record codex-app-native strategy', result)
    assertGate(result.codex_native_invocation_plan?.env.SKS_CODEX_NATIVE_AGENT_ROLE_STRATEGY === 'agent_type', 'loop fixture env missing agent_type strategy', result)
    const artifact = path.join(supported.root, '.sneakoscope', 'missions', supported.missionId, 'codex-native-invocation-plan.loop.agent-role.json')
    assertGate(await exists(artifact), 'loop invocation plan artifact missing', { artifact })
  })

  const unsupported = await createCodexNativeRuntimeFixture({
    hook: 'approved',
    agentType: 'unsupported',
    appHandoff: true,
    imagePathExposure: true,
    mcpCandidates: true,
    codeModeWebSearch: true
  })
  await withFixtureEnv(unsupported, async () => {
    const plan = await resolveCodexNativeInvocationPlan({
      root: unsupported.root,
      missionId: unsupported.missionId,
      route: '$Loop',
      desiredCapability: 'agent-role'
    })
    assertGate(plan.selected_strategy === 'message-role-fallback', 'unsupported agent_type must use message-role fallback', plan)
    assertGate(plan.warnings.some((warning) => warning.includes('message-role fallback')), 'fallback warning missing', plan)
  })
  emitGate('pipeline:codex-native-loop-routing-real-blackbox')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await runCodexNativeLoopRoutingRealBlackbox()

async function exists(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file)
    return stat.isFile()
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
