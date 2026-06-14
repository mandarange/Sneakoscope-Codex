import fs from 'node:fs/promises'
import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { imageDimensions } from '../wiki-image/image-hash.js'
import { resolveCodexNativeInvocationPlan, type CodexNativeInvocationPlan } from '../codex-native/codex-native-invocation-router.js'

export interface ImageArtifactPathContract {
  schema: 'sks.image-artifact-path-contract.v1'
  mission_id: string
  generated_at: string
  images: Array<{
    id: string
    kind: 'input_attachment' | 'generated_image' | 'edited_image' | 'visual_qa_snapshot'
    file_path: string
    relative_path: string
    route?: string | null
    stage?: string | null
    exists: boolean
    mime_type: string | null
    width?: number | null
    height?: number | null
    model_visible_path: string
    codex_native_followup_strategy: 'model-visible-path' | 'artifact-path'
    followup_edit_hint: string
  }>
  codex_native_invocation_plan?: Pick<CodexNativeInvocationPlan, 'selected_strategy' | 'proof_policy' | 'blockers' | 'warnings'> | null
  blockers: string[]
}

export async function buildImageArtifactPathContract(root: string, input: {
  missionId: string
  images: Array<{ id?: string; kind: ImageArtifactPathContract['images'][number]['kind']; filePath: string; route?: string | null; stage?: string | null }>
}): Promise<ImageArtifactPathContract> {
  const images: ImageArtifactPathContract['images'] = []
  const blockers: string[] = []
  const invocationPlan = await resolveCodexNativeInvocationPlan({
    root,
    missionId: input.missionId,
    route: '$Image',
    desiredCapability: 'image-followup'
  }).catch(() => null)
  const followupStrategy: ImageArtifactPathContract['images'][number]['codex_native_followup_strategy'] = invocationPlan?.selected_strategy === 'codex-app-native' ? 'model-visible-path' : 'artifact-path'
  for (const [index, image] of input.images.entries()) {
    const filePath = path.resolve(root, image.filePath || '')
    const exists = await fileExists(filePath)
    if (!exists) blockers.push(`${image.kind}_file_path_missing:${image.id || index + 1}`)
    const dims = exists ? await imageDimensions(filePath).catch(() => null) : null
    images.push({
      id: image.id || `image-${index + 1}`,
      kind: image.kind,
      file_path: filePath,
      relative_path: path.relative(root, filePath),
      route: image.route || null,
      stage: image.stage || null,
      exists,
      mime_type: mimeForPath(filePath),
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      model_visible_path: filePath,
      codex_native_followup_strategy: followupStrategy,
      followup_edit_hint: exists
        ? followupStrategy === 'model-visible-path'
          ? `Use this model-visible saved local path for follow-up image edits: ${filePath}`
          : `Use this saved artifact path for follow-up image edits: ${filePath}`
        : 'Image file path missing; do not run visual QA until a real saved file path exists.'
    })
  }
  if (images.some((image) => image.kind === 'generated_image' && !image.exists)) blockers.push('image_generated_file_path_missing')
  return {
    schema: 'sks.image-artifact-path-contract.v1',
    mission_id: input.missionId,
    generated_at: nowIso(),
    images,
    codex_native_invocation_plan: invocationPlan ? {
      selected_strategy: invocationPlan.selected_strategy,
      proof_policy: invocationPlan.proof_policy,
      blockers: invocationPlan.blockers,
      warnings: invocationPlan.warnings
    } : null,
    blockers: [...new Set(blockers)]
  }
}

export async function writeImageArtifactPathContract(root: string, input: {
  missionId: string
  images: Array<{ id?: string; kind: ImageArtifactPathContract['images'][number]['kind']; filePath: string; route?: string | null; stage?: string | null }>
  artifactPath?: string | null
}) {
  const contract = await buildImageArtifactPathContract(root, input)
  const artifactPath = input.artifactPath || path.join(root, '.sneakoscope', 'missions', input.missionId, 'image-artifact-path-contract.json')
  await writeJsonAtomic(artifactPath, contract)
  return { contract, artifact_path: artifactPath }
}

export async function discoverImageArtifactsInDir(dir: string) {
  const out: Array<{ id: string; kind: ImageArtifactPathContract['images'][number]['kind']; filePath: string }> = []
  await walk(dir, async (file) => {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file)) return
    out.push({
      id: path.basename(file).replace(/[^0-9A-Za-z._-]/g, '_'),
      kind: /generated|gpt-image|callout/i.test(file) ? 'generated_image' : 'visual_qa_snapshot',
      filePath: file
    })
  })
  return out
}

function mimeForPath(file: string): string | null {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return null
}

async function fileExists(file: string) {
  try {
    const st = await fs.stat(file)
    return st.isFile()
  } catch {
    return false
  }
}

async function walk(dir: string, visit: (file: string) => Promise<void>) {
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist'].includes(entry.name)) continue
      await walk(full, visit)
    } else {
      await visit(full)
    }
  }
}
