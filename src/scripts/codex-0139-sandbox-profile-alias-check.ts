#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const cap = await importDist('core/codex-control/codex-0139-capability.js')
const cli = await importDist('core/codex/codex-cli-syntax-builder.js')
assertGate(cap.codexHelpSupportsSandboxProfileAlias('Usage: codex exec -P, --profile <PROFILE>') === true, 'help output with -P alias must pass')
assertGate(cap.codexHelpSupportsSandboxProfileAlias('Usage: codex exec --profile <PROFILE>') === false, 'help output without -P alias must fail')
const shortArgs = cli.buildCodexExecArgs({ prompt: 'fixture', profile: 'sks-fast', profileAlias: 'short' })
const longArgs = cli.buildCodexExecArgs({ prompt: 'fixture', profile: 'sks-fast', profileAlias: 'long' })
assertGate(shortArgs.includes('-P') && shortArgs.includes('sks-fast'), 'Codex CLI builder must support -P profile alias', shortArgs)
assertGate(longArgs.includes('--profile') && longArgs.includes('sks-fast'), 'Codex CLI builder must fall back to long --profile', longArgs)
emitGate('codex:0139-sandbox-profile-alias', { short_alias: '-P', long_alias: '--profile' })
