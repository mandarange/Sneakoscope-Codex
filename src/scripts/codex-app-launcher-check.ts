#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
import { writeTextAtomic } from '../core/fsx.js'
process.env.SKS_CODEX_APP_LAUNCH_FAKE = '1'
const mod = await importDist('core/codex-app/codex-app-launcher.js')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-app-launcher-'))
const prompt = path.join(root, 'prompt.md')
await writeTextAtomic(prompt, 'fixture')
const artifactOnly = await mod.attemptCodexAppLaunch({ cwd: root, promptArtifactPath: prompt, mode: 'artifact-only', codexBin: 'codex' })
const launched = await mod.attemptCodexAppLaunch({ cwd: root, promptArtifactPath: prompt, mode: 'attempt-launch', codexBin: 'codex' })
assertGate(artifactOnly.attempted === false && launched.attempted === true && launched.launched === true, 'Codex App launcher must keep artifact-only safe mode and support opt-in launch attempts', { artifactOnly, launched })
emitGate('codex-app:launcher', { mode: launched.mode })
