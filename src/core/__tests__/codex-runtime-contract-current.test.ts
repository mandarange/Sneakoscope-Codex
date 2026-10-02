import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  CODEX_MIN_VERSION,
  CURRENT_CODEX_RUNTIME_CONTRACT,
  codexSdkDependencyVersion
} from '../codex-compat/codex-runtime-contract.js'
import { compareSemverLike } from '../codex-compat/codex-version-policy.js'

interface PackageShape {
  dependencies?: Record<string, string>
  files?: string[]
}

interface LockShape {
  packages?: Record<string, { version?: string }>
}

test('current Codex runtime contract derives from the exact package dependency graph without a release manifest', async () => {
  const root = process.cwd()
  const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8')) as PackageShape
  const lock = JSON.parse(await fsp.readFile(path.join(root, 'package-lock.json'), 'utf8')) as LockShape
  const sdkVersion = codexSdkDependencyVersion(root)
  const packageFiles = pkg.files || []

  assert.equal(sdkVersion, pkg.dependencies?.['@openai/codex-sdk'])
  assert.equal(CURRENT_CODEX_RUNTIME_CONTRACT.sdkVersion, sdkVersion)
  assert.equal(CURRENT_CODEX_RUNTIME_CONTRACT.targetTag, `rust-v${sdkVersion}`)
  assert.equal(CURRENT_CODEX_RUNTIME_CONTRACT.dependencySource, 'package.json#dependencies.@openai/codex-sdk')
  // The support floor is one literal, decoupled from the SDK pin, and the bundled runtime must pass it.
  assert.equal(CURRENT_CODEX_RUNTIME_CONTRACT.minVersion, CODEX_MIN_VERSION)
  assert.match(CODEX_MIN_VERSION, /^\d+\.\d+\.\d+$/)
  assert.ok(compareSemverLike(CODEX_MIN_VERSION, sdkVersion) <= 0, 'the support floor must not exceed the bundled SDK pin')
  assert.equal(lock.packages?.['node_modules/@openai/codex-sdk']?.version, sdkVersion)
  assert.equal(lock.packages?.['node_modules/@openai/codex']?.version, sdkVersion)
  assert.equal(packageFiles.some((entry) => entry.startsWith('config/codex-releases/')), false)
  assert.equal(packageFiles.some((entry) => entry.startsWith('schemas/codex/app-server-')), false)
})
