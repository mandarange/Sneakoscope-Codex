#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const bin = path.join(root, 'dist', 'bin', 'sks.js')
assertGate(fs.existsSync(bin), 'dist bin missing for live smoke', { bin, hint: 'run npm run build first' })

const targets = [
  'https://github.com/mandarange/Sneakoscope-Codex',
  'https://www.npmjs.com/package/sneakoscope'
]

const fetchResults = targets.map((target) => runJson(['super-search', 'fetch', target, '--json']))
const doctor = runJson(['super-search', 'doctor', '--json'])

for (const row of fetchResults) {
  assertGate(row.status === 0, 'super-search live fetch command failed', row)
  const result = row.json
  const directSources = result.sources.filter((source) => source.provider_id === 'direct_url')
  assertGate(directSources.some((source) => source.acquisition_verdict === 'verified_content'), 'direct_url source must have verified_content', { target: row.target, sources: result.sources })
  assertGate(directSources.some((source) => source.content_artifact), 'direct_url source must have content artifact', { target: row.target, sources: result.sources })
  assertGate(directSources.some((source) => source.content_sha256), 'direct_url source must have content sha256', { target: row.target, sources: result.sources })
  assertGate(result.proof.source_count > 0, 'live smoke must record source count > 0', result.proof)
  assertGate(result.proof.verified_source_count > 0, 'live smoke must record verified source count > 0', result.proof)
  assertGate(!result.blockers.includes('source_acquisition_unavailable'), 'live smoke must not report source_acquisition_unavailable', result)
  assertGate(result.claims.every((claim) => claim.status !== 'supported' || claim.source_ids?.length > 0), 'supported claims must be source-backed', result.claims)
}

assertGate(doctor.status === 0, 'super-search doctor command failed', doctor)
assertGate(doctor.json.schema === 'sks.super-search-doctor.v2', 'doctor must emit v2 schema', doctor.json)
assertGate(doctor.json.ok === (doctor.json.status === 'usable' || doctor.json.status === 'offline_usable'), 'doctor ok must match usable status', doctor.json)

const report = {
  schema: 'sks.super-search-live-smoke.v1',
  ok: true,
  generated_at: new Date().toISOString(),
  checked_urls: targets,
  doctor_status: doctor.json.status,
  verified_sources: fetchResults.reduce((sum, row) => sum + Number(row.json?.proof?.verified_source_count || 0), 0),
  blockers: [],
  evidence_paths: fetchResults.map((row) => row.json?.artifact_dir).filter(Boolean)
}
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true })
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'super-search-live-smoke.json'), `${JSON.stringify(report, null, 2)}\n`)

emitGate('super-search:live-smoke', {
  checked_urls: targets.length,
  doctor_status: doctor.json.status,
  verified_sources: fetchResults.reduce((sum, row) => sum + Number(row.json?.proof?.verified_source_count || 0), 0)
})

function runJson(args) {
  const proc = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SKS_RELEASE_LIVE: '1' },
    timeout: 60000
  })
  let json = null
  try {
    json = JSON.parse(proc.stdout || proc.stderr || '{}')
  } catch {
    json = null
  }
  return {
    target: args.join(' '),
    status: proc.status,
    signal: proc.signal,
    stdout: proc.stdout,
    stderr: proc.stderr,
    json
  }
}
