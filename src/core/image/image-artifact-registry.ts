import path from 'node:path'
import { readJson, writeJsonAtomic } from '../fsx.js'
import { buildImageArtifactPathContract, type ImageArtifactPathContract } from './image-artifact-path-contract.js'

export async function registerImageArtifact(root: string, input: {
  missionId: string
  id?: string
  kind: ImageArtifactPathContract['images'][number]['kind']
  filePath: string
  route: string
  stage: string
}): Promise<ImageArtifactPathContract> {
  const artifactPath = imageArtifactRegistryPath(root, input.missionId)
  const existing = await readJson(artifactPath, null) as ImageArtifactPathContract | null
  const id = input.id || path.basename(input.filePath).replace(/[^0-9A-Za-z._-]/g, '_')
  const rows = [
    ...(existing?.images || [])
      .filter((image) => image.id !== id)
      .map((image) => ({
        id: image.id,
        kind: image.kind,
        filePath: image.file_path,
        route: image.route || null,
        stage: image.stage || null
      })),
    {
      id,
      kind: input.kind,
      filePath: input.filePath,
      route: input.route,
      stage: input.stage
    }
  ]
  const contract = await buildImageArtifactPathContract(root, { missionId: input.missionId, images: rows })
  await writeJsonAtomic(artifactPath, contract)
  return contract
}

export function imageArtifactRegistryPath(root: string, missionId: string): string {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'image-artifact-path-contract.json')
}
