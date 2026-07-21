#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const naruto = readText('src/core/commands/naruto-command.ts')
const runner = readText('src/core/subagents/official-subagent-runner.ts')
const preparation = readText('src/core/subagents/official-subagent-preparation.ts')
const launcher = readText('src/core/zellij/zellij-launcher.ts')
const telemetry = readText('src/core/zellij/zellij-slot-telemetry.ts')
const mad = readText('src/core/commands/mad-sks-command.ts')

assertGate(!/\brunZellij\b/.test(naruto), 'sks naruto must not call runZellij')
assertGate(!/\blaunchZellijLayout\b|\blaunchMadZellijUi\b|\bcheckZellijCapability\b/.test(naruto), 'sks naruto must not launch or probe Zellij CLI')
assertGate(!/\brunZellij\b|\blaunchZellijLayout\b|\bcheckZellijCapability\b/.test(runner), 'official-subagent runner must not call Zellij CLI')
assertGate(!/\brunZellij\b|\blaunchZellijLayout\b/.test(preparation), 'official-subagent preparation must not call Zellij CLI')

assertGate(
  /delete-session',\s*'--force'/.test(launcher) || /delete-session", "--force"/.test(launcher) || /'delete-session',\s*'--force'/.test(launcher),
  'freshSession reset must use delete-session --force for EXITED zombies'
)
assertGate(!/runZellij\(\['kill-session'/.test(launcher), 'freshSession must not rely on kill-session alone')
assertGate(/madZellijSessionNameForCwd/.test(mad), 'MAD default session names must use socket-safe madZellijSessionNameForCwd')
assertGate(
  /ZELLIJ_SLOT_TELEMETRY_LOCK_TIMEOUT_MS\s*=\s*2_000/.test(telemetry)
    || /ZELLIJ_SLOT_TELEMETRY_LOCK_TIMEOUT_MS\s*=\s*2000/.test(telemetry),
  'official-subagent Zellij telemetry lock timeout must stay <= 2s'
)
assertGate(
  /skipped_optional_post_launch/.test(launcher),
  'optional MAD launches must skip post-launch list-panes proof'
)

emitGate('naruto:zellij-does-not-block-official-subagent')
