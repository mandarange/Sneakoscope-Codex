#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readJson } from './sks-1-18-gate-lib.js'
const pkg = readJson('package.json')
const lock = readJson('package-lock.json')
const dep = pkg.dependencies?.['@openai/codex-sdk']
const lockDep = lock.packages?.['node_modules/@openai/codex-sdk']?.version
assertGate(dep === '^0.138.0' && lockDep === '0.138.0', '@openai/codex-sdk must be pinned to 0.138.0 compatibility in package and lockfile', { dep, lockDep })
emitGate('codex-sdk:version-compat', { dependency: dep, lock_version: lockDep })
