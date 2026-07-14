import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readMacosMenubarProof, validateMacosMenubarProofArtifacts } from './macos-menubar-proof.js'
import { releaseProofDir, validateLocalReleasePackBinding } from './release-pack-receipt.js'
import { validateFullReleaseStamp } from './release-stamp-proof.js'
import { releaseOriginIdentity } from './release-origin.js'

export const MAIN_PUSH_GUARD_SCHEMA = 'sks.release-main-push-guard.v1'

export interface MainPushGuardInput {
  root: string
  expectedVersion: string
  expectedOriginMain: string
  expectedOriginIdentity: string
  requireReleaseStamp?: boolean
  requirePackProof?: boolean
  requireMacosProof?: boolean
  requireCleanTree?: boolean
}

export function inspectMainPushGuard(input: MainPushGuardInput) {
  const blockers: string[] = []
  const pkg = readJson(path.join(input.root, 'package.json')) || {}
  const head = gitText(input.root, ['rev-parse', 'HEAD'])
  const originMain = gitText(input.root, ['rev-parse', 'origin/main'])
  const origin = releaseOriginIdentity(input.root)
  if (!head) blockers.push('head_sha_unavailable')
  if (originMain !== input.expectedOriginMain) blockers.push(`origin_main_mismatch:${originMain || 'missing'}`)
  if (!origin.identity || origin.identity !== input.expectedOriginIdentity) blockers.push(`origin_identity_mismatch:${origin.identity || 'missing'}`)
  if (pkg.version !== input.expectedVersion) blockers.push(`package_version_mismatch:${String(pkg.version || 'missing')}`)
  if (!gitOk(input.root, ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])) blockers.push('origin_main_not_ancestor_of_head')
  if (input.requireCleanTree && gitText(input.root, ['status', '--porcelain=v1'])) blockers.push('worktree_not_clean')

  const proofDir = releaseProofDir(input.root, input.expectedVersion)
  if (input.requireReleaseStamp !== true) blockers.push('release_stamp_requirement_missing')
  if (input.requireReleaseStamp) {
    const validation = validateFullReleaseStamp({
      root: input.root,
      stampFile: path.join(input.root, '.sneakoscope', 'reports', 'release-check-stamp.json'),
      expectedVersion: input.expectedVersion,
      expectedHead: head
    })
    if (!validation.ok) blockers.push(...validation.blockers)
  }

  const pack = readJson(path.join(proofDir, 'pack-receipt.json'))
  if (input.requirePackProof !== true) blockers.push('pack_proof_requirement_missing')
  if (input.requirePackProof) {
    const validation = validateLocalReleasePackBinding(input.root, pack)
    if (!validation.ok) blockers.push('pack_receipt_missing_or_invalid', ...validation.blockers.map((blocker) => `pack_receipt:${blocker}`))
    if (pack?.package_version !== input.expectedVersion) blockers.push('pack_receipt_version_mismatch')
    if (head && pack?.source_commit !== head) blockers.push('pack_receipt_source_commit_mismatch')
  }

  const macos = readMacosMenubarProof(input.root, input.expectedVersion)
  if (input.requireMacosProof !== true) blockers.push('macos_proof_requirement_missing')
  if (input.requireMacosProof) blockers.push(...validateMacosMenubarProofArtifacts(input.root, macos, {
    version: input.expectedVersion,
    ...(head ? { sourceCommit: head } : {})
  }).blockers)

  if (input.requireCleanTree !== true) blockers.push('clean_tree_requirement_missing')
  return {
    schema: MAIN_PUSH_GUARD_SCHEMA,
    ok: blockers.length === 0,
    expected_version: input.expectedVersion,
    expected_origin_main: input.expectedOriginMain,
    expected_origin_identity: input.expectedOriginIdentity,
    actual_origin_identity: origin.identity || null,
    actual_origin_url: origin.url || null,
    actual_origin_main: originMain || null,
    head: head || null,
    release_stamp: input.requireReleaseStamp ? path.join('.sneakoscope', 'reports', 'release-check-stamp.json') : null,
    pack_proof: input.requirePackProof ? path.relative(input.root, path.join(proofDir, 'pack-receipt.json')) : null,
    macos_proof: input.requireMacosProof ? path.relative(input.root, path.join(proofDir, 'macos-menubar-proof.json')) : null,
    force_push_allowed: false,
    blockers,
    checked_at: new Date().toISOString()
  }
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function gitText(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function gitOk(root: string, args: string[]): boolean {
  return spawnSync('git', args, { cwd: root, stdio: 'ignore' }).status === 0
}
