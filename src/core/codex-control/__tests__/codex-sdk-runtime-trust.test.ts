import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { packageRoot } from '../../fsx.js'
import { resolveCodexSdkRuntime } from '../codex-sdk-adapter.js'

test('Codex SDK runtime rejects requested, environment, and PATH binary overrides', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-sdk-runtime-trust-'))
  const requestedShim = path.join(root, 'requested-codex')
  const envShim = path.join(root, 'env-codex')
  const pathShim = path.join(root, process.platform === 'win32' ? 'codex.cmd' : 'codex')
  const previous = new Map([
    ['SKS_CODEX_BIN', process.env.SKS_CODEX_BIN],
    ['CODEX_BIN', process.env.CODEX_BIN],
    ['PATH', process.env.PATH]
  ])
  try {
    await Promise.all([
      writeCodexShim(requestedShim),
      writeCodexShim(envShim),
      writeCodexShim(pathShim)
    ])
    process.env.SKS_CODEX_BIN = envShim
    process.env.CODEX_BIN = requestedShim
    process.env.PATH = `${root}${path.delimiter}${previous.get('PATH') || ''}`

    const runtime = await resolveCodexSdkRuntime({
      requestedScopeContract: { codex_bin: requestedShim }
    })
    const expected = expectedNativeRuntime()
    const expectedPackageRoot = await fsp.realpath(path.join(packageRoot(), 'node_modules', expected.packageName))
    const expectedBinary = await fsp.realpath(path.join(expectedPackageRoot, 'vendor', expected.targetTriple, 'bin', expected.binaryName))

    assert.equal(runtime.ok, true)
    assert.equal(runtime.identity?.source, 'project')
    assert.equal(runtime.identity?.packageRoot, expectedPackageRoot)
    assert.equal(runtime.identity?.realpath, expectedBinary)
    assert.equal(runtime.identity?.trusted, true)
    assert.equal(runtime.identity?.trust_basis, expectedTrustBasis())
    assert.notEqual(runtime.identity?.realpath, await fsp.realpath(requestedShim))
    assert.notEqual(runtime.identity?.realpath, await fsp.realpath(envShim))
    assert.notEqual(runtime.identity?.realpath, await fsp.realpath(pathShim))
  } finally {
    restoreEnv(previous)
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('Codex SDK runtime accepts the repo-installed official package and pinned version', async () => {
  const runtime = await resolveCodexSdkRuntime()
  const root = packageRoot()
  const codexPackage = JSON.parse(await fsp.readFile(path.join(root, 'node_modules', '@openai', 'codex', 'package.json'), 'utf8'))
  const sdkPackage = JSON.parse(await fsp.readFile(path.join(root, 'node_modules', '@openai', 'codex-sdk', 'package.json'), 'utf8'))
  const expected = expectedNativeRuntime()
  const nativePackageRoot = await fsp.realpath(path.join(root, 'node_modules', expected.packageName))
  const nativePackage = JSON.parse(await fsp.readFile(path.join(nativePackageRoot, 'package.json'), 'utf8'))
  const nativeBinary = await fsp.realpath(path.join(nativePackageRoot, 'vendor', expected.targetTriple, 'bin', expected.binaryName))

  assert.equal(runtime.ok, true)
  assert.equal(runtime.blockers.length, 0)
  assert.equal(codexPackage.name, '@openai/codex')
  assert.equal(sdkPackage.dependencies?.['@openai/codex'], codexPackage.version)
  assert.equal(runtime.identity?.requestedBy, 'codex-sdk-adapter')
  assert.equal(runtime.identity?.path, nativeBinary)
  assert.equal(runtime.identity?.realpath, nativeBinary)
  assert.equal(runtime.identity?.source, 'project')
  assert.equal(runtime.identity?.packageRoot, nativePackageRoot)
  assert.equal(runtime.identity?.packageVersion, nativePackage.version)
  assert.equal(runtime.identity?.version, codexPackage.version)
  assert.match(runtime.identity?.sha256 || '', /^[a-f0-9]{64}$/)
  assert.equal(runtime.identity?.platform, os.platform())
  assert.equal(runtime.identity?.arch, os.arch())
  assert.equal(runtime.identity?.trusted, true)
  assert.equal(runtime.identity?.trust_basis, expectedTrustBasis())
  assert.doesNotMatch(runtime.identity?.realpath || '', /@openai\/codex\/bin\/codex\.js$/)
})

async function writeCodexShim(file: string) {
  const body = process.platform === 'win32'
    ? '@echo off\r\necho codex-cli 999.0.0\r\n'
    : '#!/bin/sh\necho codex-cli 999.0.0\n'
  await fsp.writeFile(file, body, { mode: 0o755 })
}

function restoreEnv(previous: Map<string, string | undefined>) {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function expectedNativeRuntime() {
  const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex'
  if (process.platform === 'darwin' && process.arch === 'arm64') return { packageName: '@openai/codex-darwin-arm64', targetTriple: 'aarch64-apple-darwin', binaryName }
  if (process.platform === 'darwin' && process.arch === 'x64') return { packageName: '@openai/codex-darwin-x64', targetTriple: 'x86_64-apple-darwin', binaryName }
  if (process.platform === 'linux' && process.arch === 'arm64') return { packageName: '@openai/codex-linux-arm64', targetTriple: 'aarch64-unknown-linux-musl', binaryName }
  if (process.platform === 'linux' && process.arch === 'x64') return { packageName: '@openai/codex-linux-x64', targetTriple: 'x86_64-unknown-linux-musl', binaryName }
  if (process.platform === 'win32' && process.arch === 'arm64') return { packageName: '@openai/codex-win32-arm64', targetTriple: 'aarch64-pc-windows-msvc', binaryName }
  if (process.platform === 'win32' && process.arch === 'x64') return { packageName: '@openai/codex-win32-x64', targetTriple: 'x86_64-pc-windows-msvc', binaryName }
  throw new Error(`Unsupported test platform: ${process.platform}/${process.arch}`)
}

function expectedTrustBasis() {
  return process.platform === 'darwin'
    ? 'macos_codesign_openai_team_2DC432GLL2'
    : 'official_package_pin'
}
