import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  DELETION_COUNTING_SEMANTICS,
  REQUIRED_ARTIFACTS,
  SLICE_HASH_SEMANTICS
} from './release-closure-contract.js'

export function attachmentTruth(ledger: any): { ok: boolean; blockers: string[]; manifest: any } {
  const blockers: string[] = []
  const sourcePath = resolveSourcePath(ledger?.source_path)
  const sourceHash = sourcePath ? fileSha256(sourcePath) : null
  const lines = sourcePath ? readSourceLines(sourcePath) : null
  if (!sourcePath || !sourceHash || !lines) blockers.push('work_order_attachment_file_missing')
  if (sourceHash && sourceHash !== ledger?.source_sha256) blockers.push('work_order_attachment_sha_mismatch')
  if (lines && lines.length !== ledger?.source_line_count) blockers.push(`work_order_attachment_line_count_mismatch:${lines.length}/${String(ledger?.source_line_count)}`)
  const attachmentItems = (ledger?.items || []).filter((item: any) => item?.source?.type === 'attachment')
    .sort((a: any, b: any) => Number(a?.source?.line_start) - Number(b?.source?.line_start))
  const chatItems = (ledger?.items || []).filter((item: any) => item?.source?.type === 'chat_text')
  if (attachmentItems.length !== 26) blockers.push(`work_order_attachment_range_count_mismatch:${attachmentItems.length}/26`)
  if (chatItems.length !== 2 || chatItems.some((item: any) => !text(item?.source?.verbatim))) blockers.push('work_order_chat_sources_invalid')
  const slices: any[] = []
  let next = 1
  for (const item of attachmentItems) {
    const start = Number(item?.source?.line_start)
    const end = Number(item?.source?.line_end)
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start !== next || end < start) {
      blockers.push('work_order_coverage_invalid')
      break
    }
    const calculated = lines ? sliceSha256(lines, start, end) : null
    if (!calculated || item?.source?.slice_sha256 !== calculated) blockers.push(`work_order_slice_hash_mismatch:${item?.id || 'missing'}`)
    slices.push({ id: item?.id, line_start: start, line_end: end, sha256: calculated })
    next = end + 1
  }
  if (attachmentItems.length === 26 && lines && next !== lines.length + 1) blockers.push('work_order_coverage_incomplete')
  return {
    ok: blockers.length === 0,
    blockers,
    manifest: {
      path: ledger?.source_path || null,
      sha256: sourceHash,
      line_count: lines?.length ?? null,
      slice_hash_semantics: SLICE_HASH_SEMANTICS,
      slices
    }
  }
}

export function deletionTruth(root: string, baseline: string, head: string) {
  if (!sha40(baseline) || !sha40(head)) return { ok: false, modules: [] as string[], pureDeletionLines: 0, totalDeletions: 0, pathManifestSha256: '', manifest: null }
  const names = git(root, ['diff', '--find-renames', '--name-only', '--diff-filter=D', baseline, head])
  const deletedStats = git(root, ['diff', '--find-renames', '--numstat', '--diff-filter=D', baseline, head])
  const allStats = git(root, ['diff', '--find-renames', '--numstat', baseline, head])
  const modules = names.stdout.split(/\r?\n/).filter(Boolean).sort()
  const pureDeletionLines = numstatDeletions(deletedStats.stdout)
  const totalDeletions = numstatDeletions(allStats.stdout)
  const pathManifestSha256 = hashText(modules.length ? `${modules.join('\n')}\n` : '')
  const ok = names.ok && deletedStats.ok && allStats.ok
  return {
    ok,
    modules,
    pureDeletionLines,
    totalDeletions,
    pathManifestSha256,
    manifest: ok ? {
      counting_semantics: DELETION_COUNTING_SEMANTICS,
      removed_file_count: modules.length,
      removed_lines: pureDeletionLines,
      total_diff_deletions: totalDeletions,
      removed_path_manifest_sha256: pathManifestSha256
    } : null
  }
}

export function flattenFindingProofs(findings: any) {
  return (findings?.findings || []).flatMap((row: any) => (row?.closure?.proof || []).map((entry: any) => ({
    finding_id: row?.id,
    path: entry?.path,
    sha256: entry?.sha256,
    line_count: entry?.line_count
  }))).sort((a: any, b: any) => findingProofKey(a).localeCompare(findingProofKey(b)))
}

export function flattenWorkOrderEvidence(ledger: any) {
  return (ledger?.items || []).flatMap((item: any) => [
    ...(item?.implementation_evidence || []).map((entry: any) => ({
      work_order_id: item?.id, kind: 'implementation', path: entry?.path, sha256: entry?.sha256, line_count: entry?.line_count
    })),
    ...(item?.verification_evidence || []).map((entry: any) => ({
      work_order_id: item?.id, kind: 'verification', path: entry?.path, sha256: entry?.sha256, line_count: entry?.line_count
    }))
  ]).sort((a: any, b: any) => workOrderEvidenceKey(a).localeCompare(workOrderEvidenceKey(b)))
}

export function requiredArtifactPaths(version: string, missionId: string) {
  return Object.fromEntries(Object.entries(REQUIRED_ARTIFACTS).map(([key, value]) => [key, {
    path: value.path(version, missionId),
    schema: value.schema
  }])) as Record<keyof typeof REQUIRED_ARTIFACTS, { path: string; schema: string | null }>
}

export function sourceCommitBound(root: string, value: string, baseline: string, head: string) {
  return sha40(value) && value !== baseline && value !== head && gitOk(root, ['merge-base', '--is-ancestor', baseline, value])
    && gitOk(root, ['merge-base', '--is-ancestor', value, head])
}

export function validatePostSourceCommitDiff(root: string, sourceCommit: string, head: string, version: string, blockers: string[]) {
  if (!sha40(sourceCommit) || !sha40(head) || sourceCommit === head) return
  const diff = git(root, ['diff', '--name-only', `${sourceCommit}..${head}`, '--'])
  if (!diff.ok) {
    blockers.push('closure_post_source_diff_unavailable')
    return
  }
  const allowedPrefix = `.sneakoscope/release/${version}/`
  for (const changedPath of diff.stdout.split(/\r?\n/).filter(Boolean)) {
    if (!changedPath.startsWith(allowedPrefix)) blockers.push(`closure_post_source_change_forbidden:${changedPath}`)
  }
}

export function trackedBlobMatches(root: string, head: string, relativePath: string, expectedSha: string | null) {
  if (!sha40(head) || !sha256(expectedSha) || !gitOk(root, ['ls-files', '--error-unmatch', '--', relativePath])) return false
  const result = spawnSync('git', ['show', `${head}:${relativePath}`], { cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024 })
  return result.status === 0 && hashBuffer(Buffer.from(result.stdout || [])) === expectedSha
}

export function safeRootFile(root: string, relativePath: string) {
  const base = `${path.resolve(root)}${path.sep}`
  const resolved = path.resolve(root, relativePath)
  if (!resolved.startsWith(base)) return null
  try { return fs.lstatSync(resolved).isFile() ? resolved : null } catch { return null }
}

export function trustedRolloutPath(root: string, value: string) {
  const resolved = path.resolve(value)
  const candidates = [
    path.resolve(root, '.codex', 'sessions'),
    path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions')
  ]
  if (!candidates.some((base) => resolved === base || resolved.startsWith(`${base}${path.sep}`))) return null
  try { return fs.lstatSync(resolved).isFile() ? resolved : null } catch { return null }
}

export function rolloutLineProof(file: string, lineNumber: number) {
  const value = fs.readFileSync(file, 'utf8')
  const lines = value.split('\n')
  if (lineNumber < 1 || lineNumber > lines.length) return null
  const line = lines[lineNumber - 1] || ''
  const terminal = lineNumber < lines.length ? '\n' : ''
  const prefix = `${lines.slice(0, lineNumber).join('\n')}${terminal}`
  return { text: line, lineSha256: hashText(line), prefixSha256: hashText(prefix) }
}

export function acceptedRiskComplete(value: any) {
  return ['owner', 'expires_version', 'reproduction', 'user_impact', 'why_safe_for_6_3_0', 'removal_plan'].every((key) => text(value?.[key]))
}

export function sameJsonSet(left: any[], right: any[], key: (value: any) => string) {
  const a = left.map(key).sort()
  const b = right.map(key).sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function findingProofKey(value: any) {
  return `${String(value?.finding_id || '')}:${String(value?.path || '')}:${String(value?.sha256 || '')}:${String(value?.line_count || '')}`
}

export function workOrderEvidenceKey(value: any) {
  return `${String(value?.work_order_id || '')}:${String(value?.kind || '')}:${String(value?.path || '')}:${String(value?.sha256 || '')}:${String(value?.line_count || '')}`
}

export function sameSet(left: any, right: readonly string[]) {
  const values = strings(left)
  return values.length === right.length && new Set(values).size === values.length && right.every((value) => values.includes(value))
}

export function strings(value: any): string[] {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()) : []
}

export function unique(values: string[]) {
  return [...new Set(values)]
}

export function relative(root: string, file: string) {
  return path.relative(root, file).split(path.sep).join('/')
}

export function text(value: any): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function sha40(value: any) {
  return /^[a-f0-9]{40}$/i.test(String(value || ''))
}

export function sha256(value: any): value is string {
  return /^[a-f0-9]{64}$/i.test(String(value || ''))
}

export function positiveLineCount(value: any) {
  return Number.isSafeInteger(value) && value > 0
}

export function fileSha256(file: string): string | null {
  try { return hashBuffer(fs.readFileSync(file)) } catch { return null }
}

export function fileLineCount(file: string): number | null {
  try {
    const value = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    if (!value) return 0
    return value.endsWith('\n') ? value.slice(0, -1).split('\n').length : value.split('\n').length
  } catch {
    return null
  }
}

export function parseJson(value: string): any {
  try { return JSON.parse(value) } catch { return null }
}

export function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

export function readJsonl(file: string): any[] | null {
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim())
    return lines.length ? lines.map((line) => JSON.parse(line)) : null
  } catch { return null }
}

export function gitText(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

export function gitOk(root: string, args: string[]): boolean {
  return spawnSync('git', args, { cwd: root, stdio: 'ignore' }).status === 0
}

function resolveSourcePath(value: any) {
  if (!text(value)) return null
  const resolved = path.resolve(value)
  try { return fs.lstatSync(resolved).isFile() ? resolved : null } catch { return null }
}

function readSourceLines(file: string) {
  const value = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  if (!value) return []
  return (value.endsWith('\n') ? value.slice(0, -1) : value).split('\n')
}

function sliceSha256(lines: string[], start: number, end: number) {
  return hashText(`${lines.slice(start - 1, end).join('\n')}\n`)
}

function numstatDeletions(value: string) {
  let count = 0
  for (const row of value.split(/\r?\n/)) {
    const deleted = row.split('\t')[1]
    if (deleted && /^\d+$/.test(deleted)) count += Number(deleted)
  }
  return count
}

function hashText(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hashBuffer(value: Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return { ok: result.status === 0, stdout: result.status === 0 ? String(result.stdout || '').trim() : '' }
}
