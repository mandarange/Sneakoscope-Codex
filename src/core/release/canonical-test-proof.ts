import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'
import {
  releaseAuthorizationSnapshot,
  sameReleaseAuthorizationSnapshot,
  type ReleaseAuthorizationSnapshot
} from './release-authorization-snapshot.js'

export const CANONICAL_TEST_PROOF_SCHEMA = 'sks.canonical-test-proof.v1'

export interface CanonicalTestCorpus {
  compiled_tests: number
  unit_tests: number
  total_tests: number
  corpus_sha256: string
}

export interface CanonicalTestProof extends CanonicalTestCorpus {
  schema: typeof CANONICAL_TEST_PROOF_SCHEMA
  ok: true
  package_version: string
  node_version: string
  started_at: string
  completed_at: string
  duration_ms: number
  release_authorization_snapshot: ReleaseAuthorizationSnapshot
}

export interface CanonicalTestProofInput {
  started_at: string
  completed_at: string
  corpus: CanonicalTestCorpus
  release_authorization_snapshot: ReleaseAuthorizationSnapshot
}

export interface CurrentCanonicalTestProof {
  ok: boolean
  proof: CanonicalTestProof | null
  proof_path: string
  proof_sha256: string | null
  blockers: string[]
}

export function canonicalTestProofPath(root: string): string {
  return path.join(root, '.sneakoscope', 'reports', 'canonical-test-proof.json')
}

export function canonicalTestCorpus(root: string): CanonicalTestCorpus {
  const compiled = discover(path.join(root, 'dist'), (file) => file.endsWith('.test.js') && file.includes(`${path.sep}__tests__${path.sep}`))
  const unit = discover(path.join(root, 'test', 'unit'), (file) => file.endsWith('.test.mjs'))
  const rows = [
    ...compiled.map((file) => ({ kind: 'compiled', file })),
    ...unit.map((file) => ({ kind: 'unit', file }))
  ].sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0)
  const hash = crypto.createHash('sha256')
  for (const row of rows) {
    const bytes = fs.readFileSync(row.file)
    hash.update(row.kind)
    hash.update('\0')
    hash.update(path.relative(root, row.file).split(path.sep).join('/'))
    hash.update('\0')
    hash.update(String(bytes.length))
    hash.update('\0')
    hash.update(sha256(bytes))
    hash.update('\0')
  }
  return {
    compiled_tests: compiled.length,
    unit_tests: unit.length,
    total_tests: rows.length,
    corpus_sha256: hash.digest('hex')
  }
}

export async function writeCanonicalTestProof(root: string, input: CanonicalTestProofInput): Promise<CanonicalTestProof> {
  const pkg = readPackage(root)
  const startedMs = Date.parse(input.started_at)
  const completedMs = Date.parse(input.completed_at)
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs) || completedMs < startedMs) {
    throw new Error('canonical_test_proof_time_invalid')
  }
  const proof: CanonicalTestProof = {
    schema: CANONICAL_TEST_PROOF_SCHEMA,
    ok: true,
    package_version: String(pkg.version || ''),
    node_version: process.version,
    started_at: input.started_at,
    completed_at: input.completed_at,
    duration_ms: completedMs - startedMs,
    ...input.corpus,
    release_authorization_snapshot: input.release_authorization_snapshot
  }
  await writeJsonAtomic(canonicalTestProofPath(root), proof)
  return proof
}

export function readCurrentCanonicalTestProof(root: string, proofPath = canonicalTestProofPath(root)): CurrentCanonicalTestProof {
  const blockers: string[] = []
  let bytes: Buffer
  let proof: CanonicalTestProof | null
  try {
    bytes = fs.readFileSync(proofPath)
    proof = JSON.parse(bytes.toString('utf8')) as CanonicalTestProof
  } catch {
    return { ok: false, proof: null, proof_path: proofPath, proof_sha256: null, blockers: ['canonical_test_proof_missing_or_invalid'] }
  }

  const pkg = readPackage(root)
  const corpus = canonicalTestCorpus(root)
  const authorization = releaseAuthorizationSnapshot(root, pkg)
  const startedMs = Date.parse(String(proof?.started_at || ''))
  const completedMs = Date.parse(String(proof?.completed_at || ''))
  if (proof?.schema !== CANONICAL_TEST_PROOF_SCHEMA || proof?.ok !== true) blockers.push('canonical_test_proof_schema_invalid')
  if (proof?.package_version !== String(pkg.version || '')) blockers.push('canonical_test_proof_package_version_mismatch')
  if (proof?.node_version !== process.version) blockers.push('canonical_test_proof_node_version_mismatch')
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs) || completedMs < startedMs || proof?.duration_ms !== completedMs - startedMs) {
    blockers.push('canonical_test_proof_time_invalid')
  }
  if (!validCorpus(proof)) blockers.push('canonical_test_proof_counts_invalid')
  if (proof?.compiled_tests !== corpus.compiled_tests || proof?.unit_tests !== corpus.unit_tests || proof?.total_tests !== corpus.total_tests || proof?.corpus_sha256 !== corpus.corpus_sha256) {
    blockers.push('canonical_test_proof_corpus_stale')
  }
  if (!sameReleaseAuthorizationSnapshot(proof?.release_authorization_snapshot, authorization)) {
    blockers.push('canonical_test_proof_authorization_stale')
  }
  return {
    ok: blockers.length === 0,
    proof,
    proof_path: proofPath,
    proof_sha256: sha256(bytes),
    blockers: [...new Set(blockers)]
  }
}

export function sameCanonicalTestCorpus(left: CanonicalTestCorpus, right: CanonicalTestCorpus): boolean {
  return left.compiled_tests === right.compiled_tests
    && left.unit_tests === right.unit_tests
    && left.total_tests === right.total_tests
    && left.corpus_sha256 === right.corpus_sha256
}

function validCorpus(value: Partial<CanonicalTestCorpus> | null | undefined): boolean {
  return Number.isInteger(value?.compiled_tests) && Number(value?.compiled_tests) > 0
    && Number.isInteger(value?.unit_tests) && Number(value?.unit_tests) > 0
    && Number.isInteger(value?.total_tests)
    && value?.total_tests === Number(value?.compiled_tests) + Number(value?.unit_tests)
    && /^[a-f0-9]{64}$/.test(String(value?.corpus_sha256 || ''))
}

function readPackage(root: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
}

function discover(dir: string, accept: (file: string) => boolean): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(file)
      else if (entry.isFile() && accept(file)) out.push(file)
    }
  }
  return out.sort()
}

function sha256(value: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}
