import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const NPM_PACK_PROOF_SCHEMA = 'sks.npm-pack-proof.v1'
export const NPM_PACK_PROOF_COMMAND = Object.freeze(['npm', 'pack', '--dry-run', '--ignore-scripts', '--json'])
export const PACKLIST_PERFORMANCE_REPORT_SCHEMA = 'sks.packlist-performance.v1'
export const PACKAGE_SURFACE_BUDGET_REPORT_SCHEMA = 'sks.package-surface-budget.v1'

export interface NpmPackProof {
  schema: typeof NPM_PACK_PROOF_SCHEMA
  ok: true
  generated_at: string
  command: readonly string[]
  input_digest: string
  info_digest: string
  file_list_digest: string
  proof_id: string
  package_name: string
  package_version: string
  pack_ms: number
  info: Record<string, any>
}

export function npmPackProofPath(root: string): string {
  return path.join(root, '.sneakoscope', 'reports', 'npm-pack-proof.json')
}

export function writeNpmPackProof(root: string, info: Record<string, any>, packMs: number): NpmPackProof {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const inputDigest = currentNpmPackInputDigest(root)
  const normalizedInfo = normalizeNpmPackInfo(info)
  const infoDigest = sha256Json(normalizedInfo)
  const fileListDigest = sha256Json(normalizedInfo.files)
  const proof: NpmPackProof = {
    schema: NPM_PACK_PROOF_SCHEMA,
    ok: true,
    generated_at: new Date().toISOString(),
    command: NPM_PACK_PROOF_COMMAND,
    input_digest: inputDigest,
    info_digest: infoDigest,
    file_list_digest: fileListDigest,
    proof_id: sha256Text(`${NPM_PACK_PROOF_SCHEMA}\n${inputDigest}\n${infoDigest}\n${fileListDigest}\n${String(pkg.name || '')}@${String(pkg.version || '')}`),
    package_name: String(pkg.name || ''),
    package_version: String(pkg.version || ''),
    pack_ms: Math.max(0, Math.floor(Number(packMs) || 0)),
    info
  }
  const file = npmPackProofPath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(proof, null, 2)}\n`)
  return proof
}

export function readCurrentNpmPackProof(root: string): { ok: boolean; proof: NpmPackProof | null; blockers: string[] } {
  const blockers: string[] = []
  const file = npmPackProofPath(root)
  let proof: NpmPackProof | null = null
  try {
    proof = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    blockers.push('npm_pack_proof_missing_or_invalid')
    return { ok: false, proof: null, blockers }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  if (proof?.schema !== NPM_PACK_PROOF_SCHEMA || proof?.ok !== true) blockers.push('npm_pack_proof_schema_invalid')
  if (!sameStringList([...(proof?.command || [])], [...NPM_PACK_PROOF_COMMAND])) blockers.push('npm_pack_proof_command_invalid')
  if (proof?.package_name !== pkg.name || proof?.package_version !== pkg.version) blockers.push('npm_pack_proof_package_identity_mismatch')
  if (proof?.input_digest !== currentNpmPackInputDigest(root)) blockers.push('npm_pack_proof_stale')
  if (!proof?.info || !Array.isArray(proof.info.files)) blockers.push('npm_pack_proof_files_missing')
  if (proof?.info) {
    const normalizedInfo = normalizeNpmPackInfo(proof.info)
    const infoDigest = sha256Json(normalizedInfo)
    const fileListDigest = sha256Json(normalizedInfo.files)
    const expectedProofId = sha256Text(`${NPM_PACK_PROOF_SCHEMA}\n${proof.input_digest}\n${infoDigest}\n${fileListDigest}\n${String(pkg.name || '')}@${String(pkg.version || '')}`)
    if (proof.info_digest !== infoDigest) blockers.push('npm_pack_proof_info_digest_mismatch')
    if (proof.file_list_digest !== fileListDigest) blockers.push('npm_pack_proof_file_list_digest_mismatch')
    if (proof.proof_id !== expectedProofId) blockers.push('npm_pack_proof_id_mismatch')
  }
  return { ok: blockers.length === 0, proof, blockers }
}

export function readCurrentNpmPackGateArtifacts(root: string): {
  ok: boolean
  proof: NpmPackProof | null
  packlist_report: Record<string, any> | null
  package_surface_report: Record<string, any> | null
  blockers: string[]
} {
  const proofResult = readCurrentNpmPackProof(root)
  const blockers = [...proofResult.blockers]
  const packlistReport = readJsonReport(path.join(root, '.sneakoscope', 'reports', 'packlist-performance.json'))
  const packageSurfaceReport = readJsonReport(path.join(root, '.sneakoscope', 'reports', 'package-surface-budget.json'))

  if (!packlistReport) blockers.push('packlist_performance_report_missing_or_invalid')
  else {
    if (packlistReport.schema !== PACKLIST_PERFORMANCE_REPORT_SCHEMA || packlistReport.ok !== true) blockers.push('packlist_performance_report_schema_invalid')
    if (Array.isArray(packlistReport.blockers) && packlistReport.blockers.length > 0) blockers.push('packlist_performance_report_has_blockers')
    if (Array.isArray(packlistReport.forbidden) && packlistReport.forbidden.length > 0) blockers.push('packlist_performance_report_forbidden_files')
    if (Array.isArray(packlistReport.runtime_required_missing) && packlistReport.runtime_required_missing.length > 0) blockers.push('packlist_performance_report_runtime_files_missing')
  }

  if (!packageSurfaceReport) blockers.push('package_surface_report_missing_or_invalid')
  else {
    if (packageSurfaceReport.schema !== PACKAGE_SURFACE_BUDGET_REPORT_SCHEMA || packageSurfaceReport.ok !== true) blockers.push('package_surface_report_schema_invalid')
    if (Array.isArray(packageSurfaceReport.blockers) && packageSurfaceReport.blockers.length > 0) blockers.push('package_surface_report_has_blockers')
    if (Array.isArray(packageSurfaceReport.forbidden_findings) && packageSurfaceReport.forbidden_findings.length > 0) blockers.push('package_surface_report_forbidden_files')
  }

  const info = proofResult.proof?.info
  if (info && packlistReport) {
    if (packlistReport.pack_proof_id !== proofResult.proof?.proof_id) blockers.push('packlist_performance_report_proof_id_mismatch')
    if (packlistReport.pack_info_sha256 !== proofResult.proof?.info_digest) blockers.push('packlist_performance_report_info_digest_mismatch')
    if (packlistReport.pack_file_list_sha256 !== proofResult.proof?.file_list_digest) blockers.push('packlist_performance_report_file_list_digest_mismatch')
    if (!sameNumber(packlistReport.entryCount, info.entryCount)) blockers.push('packlist_performance_report_entry_count_mismatch')
    if (!sameNumber(packlistReport.size, info.size)) blockers.push('packlist_performance_report_size_mismatch')
    if (!sameNumber(packlistReport.unpackedSize, info.unpackedSize)) blockers.push('packlist_performance_report_unpacked_size_mismatch')
  }
  if (info && packageSurfaceReport) {
    if (packageSurfaceReport.pack_proof_id !== proofResult.proof?.proof_id) blockers.push('package_surface_report_proof_id_mismatch')
    if (packageSurfaceReport.pack_info_sha256 !== proofResult.proof?.info_digest) blockers.push('package_surface_report_info_digest_mismatch')
    if (packageSurfaceReport.pack_file_list_sha256 !== proofResult.proof?.file_list_digest) blockers.push('package_surface_report_file_list_digest_mismatch')
    if (!sameNumber(packageSurfaceReport.actual_file_count, info.entryCount)) blockers.push('package_surface_report_entry_count_mismatch')
    if (!sameNumber(packageSurfaceReport.actual_tarball_bytes, info.size)) blockers.push('package_surface_report_size_mismatch')
  }

  return {
    ok: blockers.length === 0,
    proof: proofResult.proof,
    packlist_report: packlistReport,
    package_surface_report: packageSurfaceReport,
    blockers: [...new Set(blockers)]
  }
}

export function currentNpmPackInputDigest(root: string): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const roots = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmignore', '.gitignore'])
  for (const entry of fs.readdirSync(root)) {
    if (/^(?:README|LICEN[CS]E|NOTICE)(?:\.|$)/i.test(entry)) roots.add(entry)
  }
  for (const raw of Array.isArray(pkg.files) ? pkg.files : []) {
    const value = String(raw || '').trim()
    if (!value || value.startsWith('!')) continue
    const prefix = value.split(/[*?]/, 1)[0]?.replace(/\/+$/, '') || ''
    if (prefix) roots.add(prefix)
  }
  addPackagePath(roots, pkg.main)
  addPackagePath(roots, pkg.browser)
  if (typeof pkg.bin === 'string') addPackagePath(roots, pkg.bin)
  else if (pkg.bin && typeof pkg.bin === 'object') for (const value of Object.values(pkg.bin)) addPackagePath(roots, value)
  if (typeof pkg.man === 'string') addPackagePath(roots, pkg.man)
  else if (Array.isArray(pkg.man)) for (const value of pkg.man) addPackagePath(roots, value)
  addPackagePath(roots, pkg.directories?.bin)
  const files = new Set<string>()
  for (const relative of roots) collectRoot(root, relative, files)
  const hash = crypto.createHash('sha256')
  for (const relative of [...files].sort()) {
    const file = path.join(root, relative)
    const stat = fs.statSync(file)
    hash.update(relative.replace(/\\/g, '/'))
    hash.update('\0')
    hash.update(String(stat.size))
    hash.update('\0')
    hash.update(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function normalizeNpmPackInfo(info: Record<string, any> = {}) {
  const files = (Array.isArray(info.files) ? info.files : [])
    .map((file: any) => ({
      path: String(file?.path || '').replace(/\\/g, '/'),
      size: Number(file?.size || 0),
      mode: Number(file?.mode || 0)
    }))
    .filter((file: any) => file.path)
    .sort((left: any, right: any) => left.path.localeCompare(right.path))
  return {
    id: String(info.id || ''),
    name: String(info.name || ''),
    version: String(info.version || ''),
    filename: String(info.filename || ''),
    size: Number(info.size || 0),
    unpackedSize: Number(info.unpackedSize || 0),
    shasum: String(info.shasum || ''),
    integrity: String(info.integrity || ''),
    entryCount: Number(info.entryCount || files.length),
    files
  }
}

function addPackagePath(roots: Set<string>, value: unknown) {
  const relative = String(value || '').trim().replace(/^\.\//, '')
  if (relative && !path.isAbsolute(relative) && !relative.startsWith('../')) roots.add(relative)
}

function sha256Json(value: unknown): string {
  return sha256Text(JSON.stringify(value))
}

function sha256Text(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function collectRoot(root: string, relative: string, out: Set<string>) {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) return
  const stat = fs.statSync(target)
  if (stat.isFile()) {
    out.add(path.relative(root, target))
    return
  }
  if (!stat.isDirectory()) return
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) collectRoot(root, child, out)
    else if (entry.isFile()) out.add(child)
  }
}

function sameStringList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function readJsonReport(file: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function sameNumber(left: unknown, right: unknown) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber
}
