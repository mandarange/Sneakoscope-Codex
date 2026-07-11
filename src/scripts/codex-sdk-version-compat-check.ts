#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readJson } from './sks-1-18-gate-lib.js'
import { CURRENT_CODEX_RELEASE_MANIFEST } from '../core/codex-compat/codex-release-manifest.js'
const pkg = readJson('package.json')
const lock = readJson('package-lock.json')
const dep = pkg.dependencies?.['@openai/codex-sdk']
const lockDep = lock.packages?.['node_modules/@openai/codex-sdk']?.version
assertGate(
  dep === CURRENT_CODEX_RELEASE_MANIFEST.sdkVersion && lockDep === CURRENT_CODEX_RELEASE_MANIFEST.sdkVersion,
  `@openai/codex-sdk must be pinned to ${CURRENT_CODEX_RELEASE_MANIFEST.sdkVersion} compatibility in package and lockfile`,
  { dep, lockDep, manifestSdkVersion: CURRENT_CODEX_RELEASE_MANIFEST.sdkVersion }
)
emitGate('codex-sdk:version-compat', { dependency: dep, lock_version: lockDep })
