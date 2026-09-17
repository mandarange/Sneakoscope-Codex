import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  InstallError,
  classifyRepo,
  inspectLocalDecisionModel,
  installLocalDecisionModel,
  tokenizerDigest,
  uninstallLocalDecision,
  weightManifestDigest,
  type ProcessRunner
} from '../install.js'
import { localDecisionPaths } from '../paths.js'
import { parseInstallReceipt, verifyReceiptForStart } from '../receipt.js'

const PACKAGE_SOURCE = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..', 'python', 'local_decision')
const REVISION = 'a'.repeat(40)
const ENGINE_REVISION = '2af86848be75847ccb3553b0941cc51d6ef7e4e9'

function safetensorsBytes(): Buffer {
  const header = Buffer.from(JSON.stringify({ __metadata__: { format: 'mlx' }, 'model.layers.0.w': { dtype: 'U32', shape: [1, 1], data_offsets: [0, 4] } }), 'utf8')
  const length = Buffer.alloc(8)
  length.writeBigUInt64LE(BigInt(header.length))
  return Buffer.concat([length, header, Buffer.from([1, 2, 3, 4])])
}

interface FakeRepo {
  files: Record<string, Buffer>
  sha: string
  gated?: boolean
  cardData?: Record<string, unknown>
  readme?: string
  config?: Record<string, unknown> | null
}

function weightsRepo(): FakeRepo {
  const files: Record<string, Buffer> = {
    'config.json': Buffer.from(JSON.stringify({ model_type: 'qwen2', architectures: ['Qwen2ForCausalLM'], quantization: { bits: 4, group_size: 64 }, max_position_embeddings: 32768 })),
    'tokenizer.json': Buffer.from('{"version":"1.0"}'),
    'tokenizer_config.json': Buffer.from('{"eos_token":"<|im_end|>"}'),
    'model.safetensors': safetensorsBytes(),
    'README.md': Buffer.from('license: apache-2.0')
  }
  return { files, sha: 'b'.repeat(40), cardData: { license: 'apache-2.0', base_model: 'Qwen/Qwen2.5-1.5B' } }
}

function engineSourceRepo(): FakeRepo {
  return {
    files: { 'core/engine_mlx.py': Buffer.from('print(1)'), 'README.md': Buffer.from('uses mlx-community/Qwen2.5-1.5B-Instruct-4bit') },
    sha: ENGINE_REVISION,
    cardData: { license: 'apache-2.0', library_name: 'mlx' },
    readme: 'Evaluated with `mlx-community/Qwen2.5-1.5B-Instruct-4bit`'
  }
}

function hfDeps(repo: FakeRepo) {
  const siblings = Object.entries(repo.files).map(([name, bytes]) => ({
    rfilename: name,
    size: bytes.length,
    ...(name.endsWith('.safetensors') ? { lfs: { sha256: crypto.createHash('sha256').update(bytes).digest('hex') } } : {})
  }))
  return {
    async fetchJson(url: string) {
      assert.match(url, /^https:\/\/huggingface\.co\/api\/models\//)
      return { sha: repo.sha, gated: repo.gated === true, private: false, lastModified: '2026-01-01T00:00:00.000Z', cardData: repo.cardData || {}, siblings }
    },
    async fetchText(url: string) {
      if (url.endsWith('/README.md')) return repo.readme ?? repo.files['README.md']?.toString('utf8') ?? null
      if (url.endsWith('/config.json')) return repo.files['config.json']?.toString('utf8') ?? null
      return null
    }
  }
}

/**
 * Fake interpreter: answers the version probe, "creates" a venv, reports a
 * purelib inside it, and "downloads" by writing the fake repo (optionally
 * corrupted) into the destination. Nothing here touches the network or pip.
 */
function fakeRunner(repo: FakeRepo, mutate: (files: Record<string, Buffer>, dest: string) => Promise<void> = async () => undefined): ProcessRunner {
  return async (file, args, options) => {
    const joined = args.join(' ')
    if (joined.includes('import sys,platform')) return { code: 0, stdout: `3 12 darwin arm64 ${file}\n`, stderr: '' }
    if (joined.startsWith('-I -m venv ')) {
      const venv = args[args.length - 1]!
      await fsp.mkdir(path.join(venv, 'bin'), { recursive: true, mode: 0o700 })
      await fsp.mkdir(path.join(venv, 'lib', 'python3.12', 'site-packages'), { recursive: true, mode: 0o700 })
      await fsp.copyFile(file, path.join(venv, 'bin', 'python'))
      return { code: 0, stdout: '', stderr: '' }
    }
    if (joined.includes('sysconfig.get_paths')) return { code: 0, stdout: `${path.join(path.dirname(path.dirname(file)), 'lib', 'python3.12', 'site-packages')}\n`, stderr: '' }
    if (joined.includes('sks_local_decision.snapshot download')) {
      const dest = args[args.indexOf('--dest') + 1]!
      assert.equal(args[args.indexOf('--revision') + 1], REVISION)
      assert.equal(options.env.HF_HUB_OFFLINE, undefined)
      await fsp.mkdir(dest, { recursive: true, mode: 0o700 })
      const files = { ...repo.files }
      await mutate(files, dest)
      for (const [name, bytes] of Object.entries(files)) await fsp.writeFile(path.join(dest, name), bytes)
      return { code: 0, stdout: JSON.stringify({ ok: true, path: dest, files: Object.keys(files).map((name) => ({ name, size: files[name]!.length })) }), stderr: '' }
    }
    return { code: 1, stdout: '', stderr: `unexpected invocation: ${file} ${joined}` }
  }
}

async function tempRuntime(t: test.TestContext) {
  const base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-ld-install-')))
  t.after(async () => fsp.rm(base, { recursive: true, force: true }))
  const fakePython = path.join(base, 'python3.12')
  await fsp.writeFile(fakePython, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  return { runtimeRoot: path.join(base, 'runtime'), fakePython, base }
}

function installOptions(runtimeRoot: string, fakePython: string, repo: FakeRepo, mutate?: (files: Record<string, Buffer>, dest: string) => Promise<void>, extra: Record<string, unknown> = {}) {
  return {
    modelId: 'fake-org/fake-weights',
    revision: REVISION,
    acceptLicense: true as const,
    runtimeRoot,
    env: {} as NodeJS.ProcessEnv,
    deps: { ...hfDeps(repo), run: fakeRunner(repo, mutate), pythonPath: fakePython, skipPip: true, packageSourceDir: PACKAGE_SOURCE, ...extra }
  }
}

test('inspect classifies the engine-source repository honestly and never substitutes a model', async () => {
  const repo = engineSourceRepo()
  const result = await inspectLocalDecisionModel('harshatheg/Qwen-2.5-1B-RLCD', { deps: hfDeps(repo) })
  assert.equal(result.kind, 'engine_source')
  assert.equal(result.compatible, false)
  assert.ok(result.blockers.includes('no_weights_in_repository'))
  assert.equal(result.resolvedRevision, ENGINE_REVISION)
  assert.deepEqual(result.cardMentionedRepos, ['mlx-community/Qwen2.5-1.5B-Instruct-4bit'])
  assert.equal(result.installCommand, null)
  assert.equal(classifyRepo([{ name: 'a.py', size: 1, sha256: null }]), 'engine_source')
  await assert.rejects(inspectLocalDecisionModel('not a repo id', { deps: hfDeps(repo) }), (error: unknown) => error instanceof InstallError && error.code === 'invalid_model_id')
  await assert.rejects(inspectLocalDecisionModel('fake-org/fake-weights', { revision: 'main', deps: hfDeps(repo) }), (error: unknown) => error instanceof InstallError && error.code === 'revision_must_be_commit_sha')
})

test('inspect reports a weights repository with config-derived quantization and a concrete install command', async () => {
  const repo = weightsRepo()
  const result = await inspectLocalDecisionModel('fake-org/fake-weights', { deps: hfDeps(repo) })
  assert.equal(result.kind, 'weights')
  assert.equal(result.compatible, true)
  assert.equal(result.config?.quantization, '4bit-g64')
  assert.equal(result.config?.modelType, 'qwen2')
  assert.equal(result.license, 'apache-2.0')
  assert.equal(result.installCommand, `sks decision install --model fake-org/fake-weights --revision ${'b'.repeat(40)} --accept-license --yes --json`)
  assert.ok(result.downloadBytes > 0)
})

test('install refuses the engine-source repository instead of silently swapping weights', async (t) => {
  const { runtimeRoot, fakePython } = await tempRuntime(t)
  const repo = engineSourceRepo()
  await assert.rejects(
    installLocalDecisionModel({ ...installOptions(runtimeRoot, fakePython, repo), modelId: 'harshatheg/Qwen-2.5-1B-RLCD', revision: ENGINE_REVISION }),
    (error: unknown) => {
      assert.ok(error instanceof InstallError)
      assert.equal(error.code, 'model_incompatible')
      assert.deepEqual(error.detail.cardMentionedRepos, ['mlx-community/Qwen2.5-1.5B-Instruct-4bit'])
      return true
    }
  )
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  await assert.rejects(fsp.access(paths.receiptPath))
})

test('a complete install stages, verifies digests, promotes atomically and writes a start-verifiable receipt', async (t) => {
  const { runtimeRoot, fakePython } = await tempRuntime(t)
  const repo = weightsRepo()
  const steps: string[] = []
  const receipt = await installLocalDecisionModel({ ...installOptions(runtimeRoot, fakePython, repo), onProgress: (step) => steps.push(step) })
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  assert.deepEqual(steps, ['inspected', 'python', 'package_installed', 'downloaded', 'verified'])
  assert.equal(receipt.modelRevision, REVISION)
  assert.equal(receipt.quantization, '4bit-g64')
  assert.equal(receipt.implementationOrigin, 'sks')
  assert.equal(receipt.realModelVerified, false)
  assert.equal(receipt.engineReference?.revision, ENGINE_REVISION)
  assert.equal(receipt.tokenizerDigest, await tokenizerDigest(receipt.localSnapshotPath))
  assert.equal(receipt.weightManifestDigest, await weightManifestDigest(receipt.localSnapshotPath))
  assert.ok(receipt.localSnapshotPath.startsWith(paths.snapshotsDir))
  const stored = parseInstallReceipt(JSON.parse(await fsp.readFile(paths.receiptPath, 'utf8')))
  assert.deepEqual(stored, receipt)
  assert.equal((await fsp.lstat(paths.receiptPath)).mode & 0o077, 0)
  await fsp.access(path.join(receipt.localSnapshotPath, 'LICENSE-EVIDENCE.json'))
  await fsp.access(path.join(paths.venvDir, 'lib', 'python3.12', 'site-packages', 'sks_local_decision', 'worker.py'))
  assert.deepEqual(await fsp.readdir(paths.stagingDir), [])
  await verifyReceiptForStart(receipt, paths)
  // idempotent reinstall of the same revision reuses the snapshot
  const again = await installLocalDecisionModel(installOptions(runtimeRoot, fakePython, repo))
  assert.equal(again.localSnapshotPath, receipt.localSnapshotPath)
})

test('partial download, wrong digest, symlinks, foreign ownership and repo python are rejected and never promoted', async (t) => {
  const { runtimeRoot, fakePython } = await tempRuntime(t)
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  const good = weightsRepo()
  const first = await installLocalDecisionModel(installOptions(runtimeRoot, fakePython, good))
  const receiptBefore = await fsp.readFile(paths.receiptPath, 'utf8')
  const cases: Array<[string, (files: Record<string, Buffer>, dest: string) => Promise<void>, Record<string, unknown>]> = [
    ['snapshot_incomplete', async (files) => { delete files['model.safetensors'] }, {}],
    ['weight_digest_mismatch', async (files) => { files['model.safetensors'] = Buffer.concat([files['model.safetensors']!.subarray(0, files['model.safetensors']!.length - 1), Buffer.from([9])]) }, {}],
    ['snapshot_symlink_rejected', async (files, dest) => { delete files['tokenizer_config.json']; await fsp.symlink('/etc/hosts', path.join(dest, 'tokenizer_config.json')) }, {}],
    ['snapshot_owner_mismatch', async () => undefined, { ownerUid: 424242 }],
    ['snapshot_python_source_rejected', async (files) => { files['modeling.py'] = Buffer.from('import os') }, {}]
  ]
  for (const [code, mutate, extra] of cases) {
    await assert.rejects(
      installLocalDecisionModel(installOptions(runtimeRoot, fakePython, good, mutate, extra)),
      (error: unknown) => { assert.ok(error instanceof InstallError, String(error)); assert.equal(error.code, code); return true },
      code
    )
    assert.equal(await fsp.readFile(paths.receiptPath, 'utf8'), receiptBefore, `${code} must keep the previous receipt`)
    assert.deepEqual(await fsp.readdir(paths.stagingDir), [], `${code} must clean staging`)
    await fsp.access(first.localSnapshotPath)
  }
})

test('uninstall removes only the owned inventory and reports anything else', async (t) => {
  const { runtimeRoot, fakePython } = await tempRuntime(t)
  const receipt = await installLocalDecisionModel(installOptions(runtimeRoot, fakePython, weightsRepo()))
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  const foreign = path.join(runtimeRoot, 'user-notes.txt')
  await fsp.writeFile(foreign, 'keep me')
  const outside = path.join(path.dirname(runtimeRoot), 'outside.txt')
  await fsp.writeFile(outside, 'not ours')
  const report = await uninstallLocalDecision(runtimeRoot)
  assert.equal(report.ok, true)
  assert.ok(report.removed.includes(paths.venvDir))
  assert.ok(report.removed.includes(receipt.localSnapshotPath) || report.removed.includes(paths.snapshotsDir))
  await assert.rejects(fsp.access(paths.receiptPath))
  await fsp.access(foreign)
  await fsp.access(outside)
  assert.ok(report.retained.includes(foreign))
  // a receipt that claims paths outside the root cannot make uninstall delete them
  await fsp.mkdir(runtimeRoot, { recursive: true, mode: 0o700 })
  await fsp.writeFile(paths.receiptPath, JSON.stringify({ ...receipt, inventory: [outside] }), { mode: 0o600 })
  const hostile = await uninstallLocalDecision(runtimeRoot)
  assert.equal(hostile.ok, false)
  assert.ok(hostile.blockers.some((entry) => entry.startsWith('inventory_outside_root:')))
  await fsp.access(outside)
})

test('receipt verification refuses interpreters or snapshots outside the SKS-owned root', async (t) => {
  const { runtimeRoot, fakePython } = await tempRuntime(t)
  const receipt = await installLocalDecisionModel(installOptions(runtimeRoot, fakePython, weightsRepo()))
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  await assert.rejects(verifyReceiptForStart({ ...receipt, python: { ...receipt.python, venvPython: '/usr/bin/python3' } }, paths), /receipt_python_outside_venv/)
  await assert.rejects(verifyReceiptForStart({ ...receipt, localSnapshotPath: os.tmpdir() }, paths), /receipt_snapshot_outside_root/)
  await assert.rejects(verifyReceiptForStart({ ...receipt, python: { ...receipt.python, basePythonRealpath: '/bin/sh' } }, paths), /receipt_python_realpath_mismatch/)
  assert.throws(() => parseInstallReceipt({ ...receipt, implementationOrigin: 'vendor' }), /receipt_field_invalid:implementationOrigin/)
})
