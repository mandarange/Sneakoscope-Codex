#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeImageArtifactPathContract } from '../core/image/image-artifact-path-contract.js'
import { createCodexNativeRuntimeFixture, withFixtureEnv } from './codex-native-runtime-e2e-fixture.js'

export async function runCodexNativeImageRoutingRealBlackbox(): Promise<void> {
  const modelVisible = await imageScenario({ imagePathExposure: true, missing: false })
  assertGate(modelVisible.images?.[0]?.codex_native_followup_strategy === 'model-visible-path', 'image path exposure should select model-visible path', modelVisible)

  const artifactPath = await imageScenario({ imagePathExposure: false, missing: false })
  assertGate(artifactPath.images?.[0]?.codex_native_followup_strategy === 'artifact-path', 'image path fallback should select saved artifact path', artifactPath)

  const ambiguous = await imageScenario({ imagePathExposure: true, missing: true })
  assertGate(Array.isArray(ambiguous.blockers) && ambiguous.blockers.length > 0, 'ambiguous/missing image reference must block', ambiguous)
  assertGate(JSON.stringify(ambiguous).includes('Image file path missing'), 'missing image must not produce false follow-up edit hint', ambiguous)
  emitGate('pipeline:codex-native-image-routing-real-blackbox')
}

async function imageScenario(input: { imagePathExposure: boolean; missing: boolean }): Promise<Record<string, any>> {
  const fixture = await createCodexNativeRuntimeFixture({
    hook: 'approved',
    agentType: 'supported',
    appHandoff: true,
    imagePathExposure: input.imagePathExposure,
    mcpCandidates: true,
    codeModeWebSearch: true
  })
  return withFixtureEnv(fixture, async () => {
    const imagePath = path.join(fixture.root, '.sneakoscope', 'missions', fixture.missionId, input.missing ? 'missing.png' : 'image.png')
    if (!input.missing) await fs.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const result = await writeImageArtifactPathContract(fixture.root, {
      missionId: fixture.missionId,
      images: [{ id: 'fixture-image', kind: 'generated_image', filePath: imagePath }]
    })
    const artifact = JSON.parse(await fs.readFile(result.artifact_path, 'utf8')) as Record<string, any>
    assertGate(artifact.codex_native_invocation_plan, 'image invocation plan missing from artifact', artifact)
    return artifact
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await runCodexNativeImageRoutingRealBlackbox()

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
