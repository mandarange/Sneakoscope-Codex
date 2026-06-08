#!/usr/bin/env node
import { assertGate, emitGate, packageScripts, readText } from './sks-1-18-gate-lib.js'

const scripts = packageScripts()
const mad = readText('src/core/commands/mad-sks-command.ts')
assertGate(!mad.includes('maybePromptSksUpdateForLaunch(args'), 'MAD launch must not run blocking SKS update prompt')
assertGate(!String(scripts['release:check'] || '').includes('release-registry-check'), 'release:check must not block on external registry latest mismatch')
assertGate(String(scripts['release:check'] || '').includes('release:check:affected'), 'release:check should default to affected non-registry release gates')
emitGate('update:gate-removed', { release_check: scripts['release:check'] })
