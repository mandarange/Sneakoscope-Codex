import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { MACOS_INSTALL_REQUIRED_CHECKS, MACOS_MENUBAR_PROOF_SCHEMA, MACOS_MENUBAR_REQUIRED_CHECKS } from '../macos-menubar-proof.js'
import { MAIN_PUSH_GUARD_SCHEMA } from '../main-push-guard.js'
import { writeNpmPackProof } from '../npm-pack-proof.js'
import { inspectReleaseTarball, releaseProofDir } from '../release-pack-receipt.js'

export function writeCompleteReleaseProofs(root: string, head: string, baseline = head, originIdentity = '') {
  const reports = path.join(root, '.sneakoscope', 'reports')
  const proofDir = releaseProofDir(root, '6.3.0')
  const summaryPath = path.join(reports, 'release-gates', 'fixture', 'summary.json')
  const realPath = path.join(reports, 'release-real-check.json')
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true })
  fs.mkdirSync(proofDir, { recursive: true })
  fs.writeFileSync(summaryPath, `${JSON.stringify({ schema: 'sks.release-gate-dag-run.v1', ok: true, run_id: 'fixture' })}\n`)
  fs.writeFileSync(realPath, `${JSON.stringify({ schema: 'sks.release-real-check.v1', ok: true, all_checks: [{ id: 'fixture', ok: true }] })}\n`)
  const packageJson = path.join(root, 'package.json')
  fs.writeFileSync(path.join(reports, 'release-check-stamp.json'), JSON.stringify({
    schema: 'sks.release-check-stamp.v2',
    package_name: 'sneakoscope',
    package_version: '6.3.0',
    package_json_sha256: sha(fs.readFileSync(packageJson)),
    git_commit: head,
    source_digest: 'a'.repeat(64), source_file_count: 1,
    package_files_sha256: 'b'.repeat(64), package_file_count: 1,
    release_gate_sha256: 'c'.repeat(64),
    dist_build_sha256: 'd'.repeat(64), dist_file_count: 1,
    dist_source_digest: 'e'.repeat(64), dist_source_file_count: 1,
    release_check_sha256: 'f'.repeat(64),
    release_gate_contract_schema: 'sks.release-gate-contract.v1',
    release_gate_contract_count: 1,
    release_gate_contract_sha256: '1'.repeat(64),
    release_gate_proof: {
      schema: 'sks.release-check-full-proof.v1', preset: 'release', full: true, run_id: 'fixture',
      summary_path: path.relative(root, summaryPath), summary_sha256: sha(fs.readFileSync(summaryPath)),
      release_preset_gate_ids_sha256: '2'.repeat(64), selected_gates: 1, completed: 1, failed: 0,
      affected_mode: 'full', confidence: 'full-release-proof',
      real_check_path: path.relative(root, realPath), real_check_sha256: sha(fs.readFileSync(realPath)), real_check_count: 1
    },
    generated_at: new Date().toISOString()
  }))
  const verifier = path.join(root, 'dist', 'scripts', 'release-check-stamp.js')
  fs.mkdirSync(path.dirname(verifier), { recursive: true })
  fs.writeFileSync(verifier, 'process.exit(0)\n')

  const artifacts = path.join(proofDir, 'artifacts')
  const packageDir = path.join(proofDir, 'fixture-package', 'package')
  fs.mkdirSync(artifacts, { recursive: true })
  fs.mkdirSync(packageDir, { recursive: true })
  fs.copyFileSync(packageJson, path.join(packageDir, 'package.json'))
  const tarball = path.join(artifacts, 'sneakoscope-6.3.0.tgz')
  const packed = spawnSync('tar', ['-czf', tarball, '-C', path.dirname(packageDir), 'package'], { encoding: 'utf8' })
  if (packed.status !== 0) throw new Error(String(packed.stderr || packed.stdout || 'fixture tar failed'))
  const inspected = inspectReleaseTarball({ tarball, kind: 'local', sourceCommit: head, root })
  if (!inspected.ok) throw new Error(inspected.blockers.join(','))
  const info = {
    id: 'sneakoscope@6.3.0', name: 'sneakoscope', version: '6.3.0', filename: 'sneakoscope-6.3.0.tgz',
    size: inspected.bytes, unpackedSize: inspected.unpacked_bytes, shasum: 'a'.repeat(40), integrity: inspected.sha512_integrity, entryCount: inspected.file_count,
    files: [{ path: 'package.json', size: fs.statSync(packageJson).size, mode: 0o644 }]
  }
  const npmProof = writeNpmPackProof(root, info, 1)
  fs.writeFileSync(path.join(reports, 'packlist-performance.json'), JSON.stringify({
    schema: 'sks.packlist-performance.v1', ok: true, blockers: [], forbidden: [], runtime_required_missing: [],
    pack_proof_id: npmProof.proof_id, pack_info_sha256: npmProof.info_digest, pack_file_list_sha256: npmProof.file_list_digest,
    entryCount: info.entryCount, size: info.size, unpackedSize: info.unpackedSize
  }))
  fs.writeFileSync(path.join(reports, 'package-surface-budget.json'), JSON.stringify({
    schema: 'sks.package-surface-budget.v1', ok: true, blockers: [], forbidden_findings: [],
    pack_proof_id: npmProof.proof_id, pack_info_sha256: npmProof.info_digest, pack_file_list_sha256: npmProof.file_list_digest,
    actual_file_count: info.entryCount, actual_tarball_bytes: info.size
  }))
  fs.writeFileSync(path.join(proofDir, 'pack-receipt.json'), JSON.stringify({
    ...inspected,
    npm_pack_proof: { proof_id: npmProof.proof_id, info_sha256: npmProof.info_digest, file_list_sha256: npmProof.file_list_digest }
  }))

  const installChecks = Object.fromEntries(MACOS_INSTALL_REQUIRED_CHECKS.map((key) => [key, true]))
  const buildStamp = {
    schema: 'sks.sks-menubar-build-stamp.v2', package_version: '6.3.0',
    resources_sha256: 'c'.repeat(64), source_sha256: 'd'.repeat(64)
  }
  const installReport = {
    schema: 'sks.sks-menubar-install-check.v2', ok: true, checks: installChecks, failed_checks: [],
    blockers: [], resources_sha256: 'c'.repeat(64), source_sha256: 'd'.repeat(64), result: { build_stamp: buildStamp }
  }
  const installReportPath = path.join(reports, 'menubar-install.json')
  fs.writeFileSync(installReportPath, `${JSON.stringify(installReport)}\n`)
  fs.writeFileSync(path.join(proofDir, 'macos-menubar-proof.json'), JSON.stringify({
    schema: MACOS_MENUBAR_PROOF_SCHEMA, ok: true, version: '6.3.0', source_commit: head, runner_os: 'macOS',
    swift_version: 'Swift 6', xcode_version: 'Xcode 17', app_path: '/tmp/SKS.app',
    install_report_path: path.relative(root, installReportPath), install_report_sha256: sha(fs.readFileSync(installReportPath)),
    install_report: {
      schema: installReport.schema, checks: installChecks, failed_checks: [],
      resources_sha256: installReport.resources_sha256, source_sha256: installReport.source_sha256,
      build_stamp_schema: buildStamp.schema, build_stamp_package_version: buildStamp.package_version,
      build_stamp_resources_sha256: buildStamp.resources_sha256, build_stamp_source_sha256: buildStamp.source_sha256
    },
    checks: Object.fromEntries(MACOS_MENUBAR_REQUIRED_CHECKS.map((key) => [key, true])),
    generated_at: new Date().toISOString(), blockers: []
  }))
  fs.writeFileSync(path.join(proofDir, 'main-push-guard.json'), JSON.stringify({
    schema: MAIN_PUSH_GUARD_SCHEMA, ok: true, head, expected_origin_main: baseline, actual_origin_main: baseline,
    expected_origin_identity: originIdentity, actual_origin_identity: originIdentity,
    force_push_allowed: false, blockers: []
  }))
}

function sha(value: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}
