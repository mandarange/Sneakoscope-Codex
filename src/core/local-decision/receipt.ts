import fsp from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from '../fsx.js'
import { assertOwnedRegularFile, assertPrivateFile, isInside, type LocalDecisionPaths } from './paths.js'
import type { DecisionModelEvidence, ModelInstallReceipt } from './types.js'
import type { WorkerCommand } from './worker-client.js'

export const LOCAL_DECISION_ENGINE_VERSION = 'sks-local-decision/1.0.0'
export const LOCAL_DECISION_ENGINE_ORIGIN = 'sks' as const

export class ReceiptError extends Error {
  readonly code: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${detail}` : code)
    this.name = 'ReceiptError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ReceiptError('receipt_field_invalid', field)
  return value
}

export function parseInstallReceipt(raw: unknown): ModelInstallReceipt {
  if (!isRecord(raw)) throw new ReceiptError('receipt_not_object')
  if (raw.schemaVersion !== 1) throw new ReceiptError('receipt_schema_version')
  const python = raw.python
  if (!isRecord(python)) throw new ReceiptError('receipt_field_invalid', 'python')
  const engineReference = raw.engineReference
  if (engineReference !== null && !isRecord(engineReference)) throw new ReceiptError('receipt_field_invalid', 'engineReference')
  if (!Array.isArray(raw.inventory) || !raw.inventory.every((entry) => typeof entry === 'string')) throw new ReceiptError('receipt_field_invalid', 'inventory')
  if (!Array.isArray(raw.licenseEvidencePaths) || !raw.licenseEvidencePaths.every((entry) => typeof entry === 'string')) throw new ReceiptError('receipt_field_invalid', 'licenseEvidencePaths')
  if (raw.implementationOrigin !== 'sks' && raw.implementationOrigin !== 'audited_upstream') throw new ReceiptError('receipt_field_invalid', 'implementationOrigin')
  return {
    schemaVersion: 1,
    modelId: requireText(raw.modelId, 'modelId'),
    modelRevision: requireText(raw.modelRevision, 'modelRevision'),
    localSnapshotPath: requireText(raw.localSnapshotPath, 'localSnapshotPath'),
    tokenizerDigest: requireText(raw.tokenizerDigest, 'tokenizerDigest'),
    weightManifestDigest: requireText(raw.weightManifestDigest, 'weightManifestDigest'),
    quantization: requireText(raw.quantization, 'quantization'),
    runtimeLockDigest: requireText(raw.runtimeLockDigest, 'runtimeLockDigest'),
    engineVersion: requireText(raw.engineVersion, 'engineVersion'),
    implementationOrigin: raw.implementationOrigin,
    licenseEvidencePaths: raw.licenseEvidencePaths as string[],
    installedAt: requireText(raw.installedAt, 'installedAt'),
    realModelVerified: raw.realModelVerified === true,
    engineReference: engineReference === null
      ? null
      : {
          repoId: requireText(engineReference.repoId, 'engineReference.repoId'),
          revision: requireText(engineReference.revision, 'engineReference.revision'),
          license: requireText(engineReference.license, 'engineReference.license'),
          sourceDigests: isRecord(engineReference.sourceDigests) ? engineReference.sourceDigests as Record<string, string> : {}
        },
    python: {
      venvPython: requireText(python.venvPython, 'python.venvPython'),
      basePythonRealpath: requireText(python.basePythonRealpath, 'python.basePythonRealpath'),
      version: requireText(python.version, 'python.version'),
      platform: requireText(python.platform, 'python.platform')
    },
    packageDigest: requireText(raw.packageDigest, 'packageDigest'),
    inventory: raw.inventory as string[]
  }
}

export async function readInstallReceipt(paths: LocalDecisionPaths): Promise<{ receipt: ModelInstallReceipt; digest: string } | null> {
  const raw = await fsp.readFile(paths.receiptPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (raw === null) return null
  await assertPrivateFile(paths.receiptPath)
  return { receipt: parseInstallReceipt(JSON.parse(raw)), digest: sha256(raw) }
}

export function modelEvidenceFromReceipt(receipt: ModelInstallReceipt): DecisionModelEvidence {
  return {
    modelId: receipt.modelId,
    modelRevision: receipt.modelRevision,
    engineVersion: receipt.engineVersion,
    tokenizerDigest: receipt.tokenizerDigest,
    quantization: receipt.quantization,
    implementationOrigin: receipt.implementationOrigin
  }
}

/**
 * The receipt names the interpreter, but a receipt is a file a user can edit.
 * Before anything is spawned: the interpreter must live inside the SKS-owned
 * virtualenv, must resolve to the base interpreter recorded at install time,
 * and the snapshot must live inside the SKS-owned snapshots directory.
 */
export async function verifyReceiptForStart(receipt: ModelInstallReceipt, paths: LocalDecisionPaths): Promise<void> {
  if (!isInside(paths.venvDir, receipt.python.venvPython)) throw new ReceiptError('receipt_python_outside_venv', receipt.python.venvPython)
  if (!isInside(paths.snapshotsDir, receipt.localSnapshotPath)) throw new ReceiptError('receipt_snapshot_outside_root', receipt.localSnapshotPath)
  const snapshotStat = await fsp.lstat(receipt.localSnapshotPath).catch(() => null)
  if (!snapshotStat || !snapshotStat.isDirectory() || snapshotStat.isSymbolicLink()) throw new ReceiptError('receipt_snapshot_missing')
  if (typeof process.getuid === 'function' && snapshotStat.uid !== process.getuid()) throw new ReceiptError('receipt_snapshot_owner')
  const pythonStat = await fsp.lstat(receipt.python.venvPython).catch(() => null)
  if (!pythonStat) throw new ReceiptError('receipt_python_missing')
  if (typeof process.getuid === 'function' && pythonStat.uid !== process.getuid()) throw new ReceiptError('receipt_python_owner')
  const real = await fsp.realpath(receipt.python.venvPython)
  if (real !== receipt.python.basePythonRealpath) throw new ReceiptError('receipt_python_realpath_mismatch', real)
  for (const entry of receipt.inventory) {
    if (!isInside(paths.runtimeRoot, entry)) throw new ReceiptError('receipt_inventory_outside_root', entry)
  }
  await assertOwnedRegularFile(receipt.python.basePythonRealpath)
}

/** Minimal allowlisted worker environment. No provider keys, tokens, endpoints, or PYTHONPATH. */
export function workerEnvironment(paths: LocalDecisionPaths): Record<string, string> {
  return {
    PATH: '/usr/bin:/bin',
    HOME: paths.workerHomeDir,
    TMPDIR: path.join(paths.workerHomeDir, 'tmp'),
    HF_HOME: path.join(paths.workerHomeDir, 'hf'),
    HF_HUB_OFFLINE: '1',
    HF_HUB_DISABLE_TELEMETRY: '1',
    TRANSFORMERS_OFFLINE: '1',
    TOKENIZERS_PARALLELISM: 'false',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8'
  }
}

export function workerCommandFromReceipt(receipt: ModelInstallReceipt, paths: LocalDecisionPaths): WorkerCommand {
  return {
    file: receipt.python.venvPython,
    args: ['-I', '-m', 'sks_local_decision.worker', '--snapshot', receipt.localSnapshotPath, '--receipt', paths.receiptPath],
    env: workerEnvironment(paths),
    cwd: paths.workerHomeDir
  }
}
