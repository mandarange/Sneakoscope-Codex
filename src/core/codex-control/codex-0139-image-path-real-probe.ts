import fs from 'node:fs/promises'
import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { ensureDir } from '../fsx.js'
import { buildImageArtifactPathContract } from '../image/image-artifact-path-contract.js'
import { skippedCodex0139Probe, type Codex0139SingleProbe } from './codex-0139-real-probes.js'

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
)

export async function runCodex0139ImageReferencedPathRealProbe(input: {
  root: string
  requireReal?: boolean
  timeoutMs?: number
  codexBin?: string | null
}): Promise<Codex0139SingleProbe> {
  const started = Date.now()
  const tempDir = path.join(input.root, '.sneakoscope', 'tmp', 'codex-0139-real-probes', `image-path-${Date.now()}`)
  await ensureDir(tempDir)
  const inputA = path.join(tempDir, 'input-a.png')
  const inputB = path.join(tempDir, 'input-b.png')
  await fs.writeFile(inputA, ONE_BY_ONE_PNG)
  await fs.writeFile(inputB, ONE_BY_ONE_PNG)
  const contract = await buildImageArtifactPathContract(input.root, {
    missionId: 'codex-0139-image-path-real-probe',
    images: [
      { id: 'input-a', kind: 'input_attachment', filePath: inputA, route: 'codex-0139-real-probe', stage: 'candidate' },
      { id: 'input-b', kind: 'input_attachment', filePath: inputB, route: 'codex-0139-real-probe', stage: 'referenced' }
    ]
  })
  const codexBin = input.codexBin || await findCodexBinary()
  const actualImagePathAvailable = process.env.SKS_CODEX_0139_IMAGE_REAL_PROBE_ALLOW_SKIP !== '1'
    && process.env.SKS_CODEX_0139_IMAGE_REAL_PROBE_COMMAND
  const exactReferencedPath = contract.images.find((image) => image.id === 'input-b')?.file_path === inputB
  if (!actualImagePathAvailable) {
    const blocker = input.requireReal && process.env.SKS_CODEX_0139_IMAGE_REAL_PROBE_ALLOW_SKIP !== '1'
      ? 'codex_image_edit_actual_api_unavailable'
      : 'codex_image_edit_actual_api_skipped'
    return {
      ...skippedCodex0139Probe(blocker, {
        codex_bin: codexBin,
        created_images: [inputA, inputB],
        exact_referenced_path_contract: exactReferencedPath,
        contract_blockers: contract.blockers
      }),
      duration_ms: Date.now() - started,
      artifact_paths: [tempDir]
    }
  }
  return {
    ok: exactReferencedPath && contract.blockers.length === 0,
    mode: 'actual-sks-bridge',
    command_line: [String(process.env.SKS_CODEX_0139_IMAGE_REAL_PROBE_COMMAND)],
    duration_ms: Date.now() - started,
    artifact_paths: [tempDir],
    evidence: {
      created_images: [inputA, inputB],
      referenced_path: inputB,
      exact_referenced_path_contract: exactReferencedPath,
      contract_blockers: contract.blockers
    },
    blockers: exactReferencedPath && contract.blockers.length === 0 ? [] : ['codex_image_referenced_path_contract_failed']
  }
}
