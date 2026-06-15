#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeResearchPlan } from '../core/research.js'
import { createCodexNativeRuntimeFixture, withFixtureEnv } from './codex-native-runtime-e2e-fixture.js'

export async function runCodexNativeResearchRoutingRealBlackbox(): Promise<void> {
  const mcp = await researchScenario({ mcpCandidates: true, codeModeWebSearch: true })
  assertGate(mcp.selected_source_strategy === 'mcp-plugin-candidates', 'research should prefer MCP plugin candidates', mcp)

  const web = await researchScenario({ mcpCandidates: false, codeModeWebSearch: true })
  assertGate(web.selected_source_strategy === 'web-sources', 'research should fall back to web sources when MCP candidates are absent', web)

  const local = await researchScenario({ mcpCandidates: false, codeModeWebSearch: false })
  assertGate(local.selected_source_strategy === 'local-files', 'research should fall back to local files when MCP/web are absent', local)
  assertGate(local.hook_derived_source_evidence_allowed === false, 'research must exclude hook-derived evidence unless explicitly approved', local)
  emitGate('pipeline:codex-native-research-routing-real-blackbox')
}

async function researchScenario(input: { mcpCandidates: boolean; codeModeWebSearch: boolean }): Promise<Record<string, unknown>> {
  const fixture = await createCodexNativeRuntimeFixture({
    hook: 'approved',
    agentType: 'supported',
    appHandoff: true,
    imagePathExposure: true,
    mcpCandidates: input.mcpCandidates,
    codeModeWebSearch: input.codeModeWebSearch
  })
  return withFixtureEnv(fixture, async () => {
    const dir = path.join(fixture.root, '.sneakoscope', 'missions', fixture.missionId)
    await writeResearchPlan(dir, 'research source routing fixture', { root: fixture.root, missionId: fixture.missionId })
    const artifact = JSON.parse(await fs.readFile(path.join(dir, 'research', 'codex-native-invocation.json'), 'utf8')) as Record<string, unknown>
    assertGate(Array.isArray((artifact.mcp_source as { required_artifacts?: unknown })?.required_artifacts), 'research source candidate artifact details missing', artifact)
    return artifact
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await runCodexNativeResearchRoutingRealBlackbox()

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
