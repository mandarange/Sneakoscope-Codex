import fs from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, runProcess, sha256, writeJsonAtomic } from '../fsx.js'

export interface ReleaseProofTruth {
  schema: 'sks.release-proof-truth.v1'
  generated_at: string
  package_version: string
  git_commit_sha: string | null
  git_branch: string | null
  git_status_clean: boolean
  package_json_sha256: string
  package_lock_sha256: string
  version_ts_sha256: string
  changelog_sha256: string
  release_gates_sha256: string
  npm_packlist_count?: number
  npm_packlist_bytes?: number
}

export async function buildReleaseProofTruth(root: string): Promise<ReleaseProofTruth> {
  const pkg = await readJson<any>(path.join(root, 'package.json'))
  const gitCommit = await gitOutput(root, ['rev-parse', 'HEAD'])
  const gitBranch = await gitOutput(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const gitStatus = await gitOutput(root, ['status', '--porcelain'])
  const packlist = await readNpmPacklist(root)
  return {
    schema: 'sks.release-proof-truth.v1',
    generated_at: nowIso(),
    package_version: String(pkg.version || ''),
    git_commit_sha: gitCommit || null,
    git_branch: gitBranch || null,
    git_status_clean: gitStatus === '',
    package_json_sha256: await shaFile(root, 'package.json'),
    package_lock_sha256: await shaFile(root, 'package-lock.json'),
    version_ts_sha256: await shaFile(root, 'src/core/version.ts'),
    changelog_sha256: await shaFile(root, 'CHANGELOG.md'),
    release_gates_sha256: await shaFile(root, 'release-gates.v2.json'),
    ...(packlist ? {
      npm_packlist_count: packlist.count,
      npm_packlist_bytes: packlist.bytes
    } : {})
  }
}

export async function writeReleaseProofTruth(root: string): Promise<ReleaseProofTruth> {
  const truth = await buildReleaseProofTruth(root)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'release-proof-truth.json'), truth)
  await writeJsonAtomic(path.join(root, 'dist', 'release-proof-truth.json'), truth)
  return truth
}

async function shaFile(root: string, rel: string): Promise<string> {
  return sha256(await fs.readFile(path.join(root, rel)))
}

async function gitOutput(root: string, args: string[]): Promise<string | null> {
  const result = await runProcess('git', args, { cwd: root, timeoutMs: 10000, maxOutputBytes: 64 * 1024 }).catch(() => null)
  if (!result || result.code !== 0) return null
  return String(result.stdout || '').trim()
}

async function readNpmPacklist(root: string): Promise<{ count: number; bytes: number } | null> {
  const result = await runProcess('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    timeoutMs: 60000,
    maxOutputBytes: 1024 * 1024
  }).catch(() => null)
  if (!result || result.code !== 0) return null
  try {
    const parsed = JSON.parse(String(result.stdout || '[]'))
    const files = Array.isArray(parsed?.[0]?.files) ? parsed[0].files : []
    return {
      count: files.length,
      bytes: files.reduce((sum: number, file: any) => sum + Number(file.size || 0), 0)
    }
  } catch {
    return null
  }
}
