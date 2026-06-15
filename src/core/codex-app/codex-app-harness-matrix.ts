import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'
import type { CodexAppHarnessMatrix } from './codex-app-types.js'
import { buildCodexAppHarnessMatrixFromNative } from '../codex-native/codex-native-harness-compat.js'

export async function buildCodexAppHarnessMatrix(input: {
  root: string
  missionDir?: string | null
  applyRepairs?: boolean
  repairManagedAssets?: boolean
  mode?: 'read-only' | 'repair'
} = { root: process.cwd() }): Promise<CodexAppHarnessMatrix> {
  const matrix = await buildCodexAppHarnessMatrixFromNative(input)
  await writeCodexAppHarnessMatrix(path.resolve(input.root || process.cwd()), matrix, input.missionDir)
  return matrix
}

export async function writeCodexAppHarnessMatrix(root: string, matrix: CodexAppHarnessMatrix, missionDir?: string | null): Promise<void> {
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-app-harness-matrix.json'), matrix)
  if (missionDir) await writeJsonAtomic(path.join(missionDir, 'codex-app-harness-matrix.json'), matrix).catch(() => undefined)
}
