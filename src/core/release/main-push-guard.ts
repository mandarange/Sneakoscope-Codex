import path from 'node:path'
import { readMacosMenubarProof, validateMacosMenubarProofArtifacts } from './macos-menubar-proof.js'
import {
  inspectReleaseClosure as inspectReleaseClosureContract,
  RELEASE_630_MISSION_ID as DEFAULT_RELEASE_MISSION_ID
} from './release-closure.js'
import { fileSha256, gitOk, gitText, readJson, unique } from './release-closure-helpers.js'
import { releaseOriginIdentity } from './release-origin.js'
import { releaseProofDir, validateLocalReleasePackBinding } from './release-pack-receipt.js'
import { validateFullReleaseStamp } from './release-stamp-proof.js'

export {
  buildReleaseClosureManifest,
  inspectReleaseClosure,
  releaseClosureManifestPath,
  RELEASE_630_MISSION_ID,
  RELEASE_CLOSURE_MANIFEST_SCHEMA,
  RELEASE_CLOSURE_SCHEMA,
  writeReleaseClosureManifest
} from './release-closure.js'
export type { ReleaseClosureInput } from './release-closure.js'

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
  expectedReleaseMissionId?: string
  expectedWorkOrderSha256?: string
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

  const closure = inspectReleaseClosureContract({
    root: input.root,
    version: input.expectedVersion,
    expectedHead: head,
    expectedBaseline: input.expectedOriginMain,
    expectedMissionId: input.expectedReleaseMissionId || DEFAULT_RELEASE_MISSION_ID,
    ...(input.expectedWorkOrderSha256 === undefined ? {} : { expectedWorkOrderSha256: input.expectedWorkOrderSha256 })
  })
  blockers.push(...closure.blockers.map((blocker) => `release_closure:${blocker}`))

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

  const upgrade = validateReleaseUpgradeProof(input.root, input.expectedVersion, head, pack)
  blockers.push(...upgrade.blockers.map((blocker) => `upgrade_proof:${blocker}`))

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
    upgrade_proof: upgrade,
    macos_proof: input.requireMacosProof ? path.relative(input.root, path.join(proofDir, 'macos-menubar-proof.json')) : null,
    release_closure: closure,
    force_push_allowed: false,
    blockers: unique(blockers),
    checked_at: new Date().toISOString()
  }
}

export function validateReleaseUpgradeProof(root: string, version: string, sourceCommit: string, pack: any) {
  const file = path.join(releaseProofDir(root, version), `upgrade-6.2-to-${version}.json`)
  const report = readJson(file)
  const blockers: string[] = []
  const targetReceipt = path.join(releaseProofDir(root, version), 'pack-receipt.json')
  const targetTarball = pack?.tarball_path ? path.resolve(root, pack.tarball_path) : ''
  const baselineSha = 'dd0bfc022348c11dc737055845708f6272beaf2a8f9c16d068acf3c8c612f9bc'
  if (report?.schema !== 'sks.release-upgrade-smoke.v1') blockers.push('missing_or_invalid')
  if (report?.ok !== true || !Array.isArray(report?.blockers) || report.blockers.length) blockers.push('not_ok')
  if (report?.platform !== 'darwin' || report?.baseline_version !== '6.2.0' || report?.target_version !== version) blockers.push('version_or_platform_mismatch')
  if (report?.baseline?.pinned_sha256 !== baselineSha || report?.baseline?.tarball_sha256 !== baselineSha) blockers.push('baseline_binding_mismatch')
  if (report?.source_tree?.ok !== true || report?.source_tree?.head !== sourceCommit
    || !Array.isArray(report?.source_tree?.dirty_entries) || report.source_tree.dirty_entries.length
    || !Array.isArray(report?.source_tree?.blockers) || report.source_tree.blockers.length) blockers.push('source_commit_mismatch')
  if (report?.target?.binding_ok !== true || report?.target?.receipt_source_commit !== sourceCommit) blockers.push('target_source_commit_mismatch')
  if (path.resolve(String(report?.target?.receipt_path || '')) !== targetReceipt) blockers.push('target_receipt_path_mismatch')
  if (!targetTarball || path.resolve(String(report?.target?.tarball_path || '')) !== targetTarball) blockers.push('target_tarball_path_mismatch')
  if (report?.target?.tarball_sha256 !== pack?.sha256) blockers.push('target_tarball_sha256_mismatch')
  const stateNames = ['baseline_package', 'baseline_menubar', 'target_package', 'target_menubar', 'menubar_rollback', 'target_menubar_reinstall', 'package_rollback']
  if (Object.keys(report?.states || {}).length !== stateNames.length || stateNames.some((name) => {
    const state = report?.states?.[name]
    const expected = name.startsWith('target_') ? version : '6.2.0'
    return state?.status !== 'passed' || state?.expected_version !== expected || state?.observed_version !== expected
      || !Array.isArray(state?.blockers) || state.blockers.length
  })) blockers.push('lifecycle_incomplete')
  return {
    ok: blockers.length === 0,
    path: path.relative(root, file),
    sha256: fileSha256(file),
    blockers: unique(blockers)
  }
}
