import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { DEFAULT_MAX_PACK_BYTES, DEFAULT_MAX_UNPACKED_BYTES } from './package-size-budget.js'
import { readCurrentNpmPackGateArtifacts } from './npm-pack-proof.js'

export const RELEASE_PACK_RECEIPT_SCHEMA = 'sks.release-pack-receipt.v1'
export const RELEASE_PACK_COMPARE_SCHEMA = 'sks.release-pack-compare.v1'

export type ReleasePackKind = 'local' | 'staged'

export interface ReleasePackReceipt {
  schema: typeof RELEASE_PACK_RECEIPT_SCHEMA
  ok: boolean
  kind: ReleasePackKind
  package_name: string
  package_version: string
  source_commit: string | null
  tarball_name: string
  tarball_path: string
  bytes: number
  unpacked_bytes: number
  sha256: string
  sha512_integrity: string
  file_count: number
  file_list_sha256: string
  budget: {
    ok: boolean
    max_packed_bytes: number
    max_unpacked_bytes: number
    max_file_count: number
    blockers: string[]
  }
  npm_pack_proof: {
    proof_id: string
    info_sha256: string
    file_list_sha256: string
  } | null
  generated_at: string
  blockers: string[]
}

export interface ReleasePackCompare {
  schema: typeof RELEASE_PACK_COMPARE_SCHEMA
  ok: boolean
  package_name: string | null
  package_version: string | null
  local_sha256: string | null
  staged_sha256: string | null
  blockers: string[]
  compared_at: string
}

export function releaseProofDir(root: string, version: string): string {
  return path.join(root, '.sneakoscope', 'reports', 'release', version)
}

export function inspectReleaseTarball(input: {
  tarball: string
  kind: ReleasePackKind
  sourceCommit?: string | null
  npmPackProof?: ReleasePackReceipt['npm_pack_proof']
  root?: string
}): ReleasePackReceipt {
  const tarball = path.resolve(input.tarball)
  const blockers: string[] = []
  let bytes = Buffer.alloc(0)
  try {
    bytes = fs.readFileSync(tarball)
  } catch {
    blockers.push('tarball_missing_or_unreadable')
  }
  const inventory = bytes.length ? tarInventory(tarball) : { files: [], blockers: ['tarball_inventory_unavailable'] }
  blockers.push(...inventory.blockers)
  const packageJson = bytes.length ? tarPackageJson(tarball) : null
  if (!packageJson) blockers.push('tarball_package_json_missing_or_invalid')
  const files = [...inventory.files].sort()
  const unpackedBytes = bytes.length && inventory.blockers.length === 0 ? tarUnpackedBytes(tarball) : 0
  if (bytes.length && unpackedBytes <= 0) blockers.push('tarball_unpacked_size_unavailable')
  const sha256 = bytes.length ? hash(bytes, 'sha256', 'hex') : ''
  const sha512Base64 = bytes.length ? hash(bytes, 'sha512', 'base64') : ''
  const budgetBlockers = [
    ...(bytes.length > DEFAULT_MAX_PACK_BYTES ? ['packed_bytes_over_limit'] : []),
    ...(unpackedBytes > DEFAULT_MAX_UNPACKED_BYTES ? ['unpacked_bytes_over_limit'] : []),
    ...(files.length > 2100 ? ['file_count_over_limit'] : [])
  ]
  blockers.push(...budgetBlockers.map((blocker) => `package_budget:${blocker}`))
  return {
    schema: RELEASE_PACK_RECEIPT_SCHEMA,
    ok: blockers.length === 0,
    kind: input.kind,
    package_name: String(packageJson?.name || ''),
    package_version: String(packageJson?.version || ''),
    source_commit: input.sourceCommit || null,
    tarball_name: path.basename(tarball),
    tarball_path: input.root ? normalizePath(path.relative(input.root, tarball)) : normalizePath(tarball),
    bytes: bytes.length,
    unpacked_bytes: unpackedBytes,
    sha256,
    sha512_integrity: sha512Base64 ? `sha512-${sha512Base64}` : '',
    file_count: files.length,
    file_list_sha256: hash(Buffer.from(files.join('\n')), 'sha256', 'hex'),
    budget: {
      ok: budgetBlockers.length === 0,
      max_packed_bytes: DEFAULT_MAX_PACK_BYTES,
      max_unpacked_bytes: DEFAULT_MAX_UNPACKED_BYTES,
      max_file_count: 2100,
      blockers: budgetBlockers
    },
    npm_pack_proof: input.npmPackProof || null,
    generated_at: new Date().toISOString(),
    blockers: unique(blockers)
  }
}

export function compareReleasePacks(local: ReleasePackReceipt, staged: ReleasePackReceipt): ReleasePackCompare {
  const blockers: string[] = []
  const localValidation = validateReleasePackReceipt(local, 'local', { requireNpmPackProof: true })
  const stagedValidation = validateReleasePackReceipt(staged, 'staged')
  if (!localValidation.ok) blockers.push('local_receipt_invalid', ...localValidation.blockers.map((blocker) => `local_receipt:${blocker}`))
  if (!stagedValidation.ok) blockers.push('staged_receipt_invalid', ...stagedValidation.blockers.map((blocker) => `staged_receipt:${blocker}`))
  if (local?.package_name !== staged?.package_name) blockers.push('package_name_mismatch')
  if (local?.package_version !== staged?.package_version) blockers.push('package_version_mismatch')
  if (local?.bytes !== staged?.bytes) blockers.push('tarball_size_mismatch')
  if (local?.unpacked_bytes !== staged?.unpacked_bytes) blockers.push('tarball_unpacked_size_mismatch')
  if (local?.sha256 !== staged?.sha256) blockers.push('tarball_sha256_mismatch')
  if (local?.sha512_integrity !== staged?.sha512_integrity) blockers.push('tarball_integrity_mismatch')
  if (local?.file_count !== staged?.file_count) blockers.push('file_count_mismatch')
  if (local?.file_list_sha256 !== staged?.file_list_sha256) blockers.push('file_list_mismatch')
  return {
    schema: RELEASE_PACK_COMPARE_SCHEMA,
    ok: blockers.length === 0,
    package_name: local?.package_name || staged?.package_name || null,
    package_version: local?.package_version || staged?.package_version || null,
    local_sha256: local?.sha256 || null,
    staged_sha256: staged?.sha256 || null,
    blockers: unique(blockers),
    compared_at: new Date().toISOString()
  }
}

export function validateReleasePackReceipt(value: unknown, expectedKind?: ReleasePackKind, options: { requireNpmPackProof?: boolean } = {}) {
  const receipt = value as Partial<ReleasePackReceipt> | null
  const blockers: string[] = []
  if (!receipt || receipt.schema !== RELEASE_PACK_RECEIPT_SCHEMA) blockers.push('schema_invalid')
  if (receipt?.ok !== true) blockers.push('not_ok')
  if (receipt?.kind !== 'local' && receipt?.kind !== 'staged') blockers.push('kind_invalid')
  if (expectedKind && receipt?.kind !== expectedKind) blockers.push(`kind_not_${expectedKind}`)
  if (!receipt?.package_name) blockers.push('package_name_missing')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(receipt?.package_version || ''))) blockers.push('package_version_invalid')
  if (!receipt?.tarball_name || !String(receipt.tarball_name).endsWith('.tgz')) blockers.push('tarball_name_invalid')
  if (!receipt?.tarball_path || !String(receipt.tarball_path).endsWith('.tgz')) blockers.push('tarball_path_invalid')
  if (!Number.isSafeInteger(receipt?.bytes) || Number(receipt?.bytes) <= 0) blockers.push('bytes_invalid')
  if (!Number.isSafeInteger(receipt?.unpacked_bytes) || Number(receipt?.unpacked_bytes) <= 0) blockers.push('unpacked_bytes_invalid')
  if (!/^[a-f0-9]{64}$/i.test(String(receipt?.sha256 || ''))) blockers.push('sha256_invalid')
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(String(receipt?.sha512_integrity || ''))) blockers.push('sha512_integrity_invalid')
  if (!Number.isSafeInteger(receipt?.file_count) || Number(receipt?.file_count) <= 0) blockers.push('file_count_invalid')
  if (!/^[a-f0-9]{64}$/i.test(String(receipt?.file_list_sha256 || ''))) blockers.push('file_list_sha256_invalid')
  if (!receipt?.generated_at || Number.isNaN(Date.parse(String(receipt.generated_at)))) blockers.push('generated_at_invalid')
  if (!Array.isArray(receipt?.blockers) || receipt.blockers.length > 0) blockers.push('receipt_blockers_present')
  const computedBudgetBlockers = [
    ...(Number(receipt?.bytes || 0) > DEFAULT_MAX_PACK_BYTES ? ['packed_bytes_over_limit'] : []),
    ...(Number(receipt?.unpacked_bytes || 0) > DEFAULT_MAX_UNPACKED_BYTES ? ['unpacked_bytes_over_limit'] : []),
    ...(Number(receipt?.file_count || 0) > 2100 ? ['file_count_over_limit'] : [])
  ]
  if (receipt?.budget?.max_packed_bytes !== DEFAULT_MAX_PACK_BYTES
    || receipt?.budget?.max_unpacked_bytes !== DEFAULT_MAX_UNPACKED_BYTES
    || receipt?.budget?.max_file_count !== 2100
    || receipt?.budget?.ok !== (computedBudgetBlockers.length === 0)
    || !Array.isArray(receipt?.budget?.blockers)
    || JSON.stringify([...receipt.budget.blockers].sort()) !== JSON.stringify([...computedBudgetBlockers].sort())) {
    blockers.push('package_budget_invalid_or_failed')
  }
  if (options.requireNpmPackProof) {
    if (!/^[a-f0-9]{64}$/i.test(String(receipt?.npm_pack_proof?.proof_id || ''))) blockers.push('npm_pack_proof_id_invalid')
    if (!/^[a-f0-9]{64}$/i.test(String(receipt?.npm_pack_proof?.info_sha256 || ''))) blockers.push('npm_pack_info_sha256_invalid')
    if (!/^[a-f0-9]{64}$/i.test(String(receipt?.npm_pack_proof?.file_list_sha256 || ''))) blockers.push('npm_pack_file_list_sha256_invalid')
  }
  if (receipt?.kind === 'local' && !/^[a-f0-9]{40}$/i.test(String(receipt?.source_commit || ''))) blockers.push('source_commit_invalid')
  return { ok: blockers.length === 0, receipt: receipt || null, blockers: unique(blockers) }
}

export function validateLocalReleasePackBinding(root: string, value: unknown) {
  const validation = validateReleasePackReceipt(value, 'local', { requireNpmPackProof: true })
  const receipt = validation.receipt
  const blockers = [...validation.blockers]
  const gate = readCurrentNpmPackGateArtifacts(root)
  if (!gate.ok || !gate.proof) blockers.push(...gate.blockers.map((blocker) => `npm_pack_gate:${blocker}`))
  else {
    const info = gate.proof.info || {}
    if (receipt?.npm_pack_proof?.proof_id !== gate.proof.proof_id) blockers.push('npm_pack_proof_id_mismatch')
    if (receipt?.npm_pack_proof?.info_sha256 !== gate.proof.info_digest) blockers.push('npm_pack_info_sha256_mismatch')
    if (receipt?.npm_pack_proof?.file_list_sha256 !== gate.proof.file_list_digest) blockers.push('npm_pack_file_list_sha256_mismatch')
    if (receipt?.package_name !== gate.proof.package_name || receipt?.package_version !== gate.proof.package_version) blockers.push('npm_pack_package_identity_mismatch')
    if (receipt?.tarball_name !== info.filename) blockers.push('npm_pack_tarball_name_mismatch')
    if (receipt?.bytes !== info.size) blockers.push('npm_pack_size_mismatch')
    if (receipt?.unpacked_bytes !== info.unpackedSize) blockers.push('npm_pack_unpacked_size_mismatch')
    if (receipt?.file_count !== info.entryCount) blockers.push('npm_pack_file_count_mismatch')
    if (receipt?.sha512_integrity !== info.integrity) blockers.push('npm_pack_integrity_mismatch')
  }
  const head = gitHead(root)
  if (!head || receipt?.source_commit !== head) blockers.push('npm_pack_source_commit_mismatch')
  const tarball = receipt?.tarball_path ? path.resolve(root, receipt.tarball_path) : ''
  const managedRoot = path.resolve(root, '.sneakoscope', 'reports', 'release', String(receipt?.package_version || ''), 'artifacts')
  const relative = tarball ? path.relative(managedRoot, tarball) : '..'
  if (!tarball || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(tarball)) blockers.push('local_tarball_artifact_missing_or_unsafe')
  else {
    const actual = inspectReleaseTarball({ tarball, kind: 'local', sourceCommit: receipt?.source_commit || null, root })
    for (const key of ['package_name', 'package_version', 'tarball_name', 'tarball_path', 'bytes', 'unpacked_bytes', 'sha256', 'sha512_integrity', 'file_count', 'file_list_sha256'] as const) {
      if (actual[key] !== receipt?.[key]) blockers.push(`local_tarball_artifact_mismatch:${key}`)
    }
    if (!actual.ok) blockers.push(...actual.blockers.map((blocker) => `local_tarball_artifact:${blocker}`))
  }
  return { ok: blockers.length === 0, receipt, gate, blockers: unique(blockers) }
}

export function writeReleaseJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function tarInventory(tarball: string): { files: string[]; blockers: string[] } {
  const result = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.status !== 0) return { files: [], blockers: ['tarball_inventory_command_failed'] }
  const blockers: string[] = []
  const files = String(result.stdout || '').split(/\r?\n/).filter(Boolean).filter((entry) => !entry.endsWith('/'))
  for (const entry of files) {
    const normalized = path.posix.normalize(entry)
    if (!entry.startsWith('package/') || normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(entry)) {
      blockers.push(`unsafe_tarball_path:${entry}`)
    }
    if (/(^|\/)\.env(?:\.|$)/i.test(entry)) blockers.push(`secret_file_in_tarball:${entry}`)
  }
  const verbose = spawnSync('tar', ['-tvzf', tarball], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (verbose.status !== 0) blockers.push('tarball_type_inventory_command_failed')
  else for (const line of String(verbose.stdout || '').split(/\r?\n/).filter(Boolean)) {
    const type = line.trimStart()[0] || ''
    if (type && type !== '-' && type !== 'd') blockers.push(`unsafe_tarball_entry_type:${type}`)
  }
  return { files, blockers }
}

function tarPackageJson(tarball: string): Record<string, any> | null {
  const result = spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  if (result.status !== 0) return null
  try {
    const parsed = JSON.parse(String(result.stdout || ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function tarUnpackedBytes(tarball: string): number {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-release-pack-unpacked-'))
  try {
    const result = spawnSync('tar', ['-xzf', tarball, '-C', temp], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    if (result.status !== 0) return 0
    return directoryBytes(temp)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function directoryBytes(directory: string): number {
  let total = 0
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) total += directoryBytes(file)
    else if (entry.isFile()) total += fs.statSync(file).size
  }
  return total
}

function hash(value: crypto.BinaryLike, algorithm: 'sha256' | 'sha512', encoding: 'hex' | 'base64'): string {
  return crypto.createHash(algorithm).update(value).digest(encoding)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function gitHead(root: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/')
}
