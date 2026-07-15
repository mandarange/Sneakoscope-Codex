import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INSTALLED_REMOVED_ARGUMENT_PROBES,
  INSTALLED_REMOVED_COMMANDS,
  INSTALLED_REMOVED_DOLLAR_COMMANDS,
  INSTALLED_REMOVED_SUBCOMMAND_PROBES,
  INSTALLED_REQUIRED_COMMANDS,
  INSTALLED_REQUIRED_DOLLAR_COMMANDS,
  retiredSurfaceTokenFindings,
  sanitizeInstalledSurfaceProbeCommand,
  summarizeInstalledSmokeCommand,
  summarizeInstalledSurfaceClosure,
  validateInstalledMenubarStatus,
  validateInstalledPublicSurface
} from '../installed-package-smoke.js'

function commandManifest(names: readonly string[]) {
  return { commands: names.map((name) => ({ name })) }
}

function dollarManifest(commands: readonly string[], aliases: readonly string[] = []) {
  return {
    dollar_commands: commands.map((command) => ({ command })),
    app_skill_aliases: aliases.map((app_skill) => ({ app_skill }))
  }
}

test('installed public surface accepts only current Naruto-era manifests', () => {
  const result = validateInstalledPublicSurface(
    commandManifest(INSTALLED_REQUIRED_COMMANDS),
    dollarManifest(INSTALLED_REQUIRED_DOLLAR_COMMANDS)
  )
  assert.deepEqual(result.blockers, [])
})

test('installed public surface rejects every retired command and dollar alias', () => {
  const result = validateInstalledPublicSurface(
    commandManifest([...INSTALLED_REQUIRED_COMMANDS, ...INSTALLED_REMOVED_COMMANDS]),
    dollarManifest(
      [...INSTALLED_REQUIRED_DOLLAR_COMMANDS, ...INSTALLED_REMOVED_DOLLAR_COMMANDS],
      INSTALLED_REMOVED_DOLLAR_COMMANDS.map((value) => value.toLowerCase())
    )
  )
  assert.equal(
    result.blockers.filter((value) => value.startsWith('installed_command_manifest_contains_non_current:')).length,
    INSTALLED_REMOVED_COMMANDS.length
  )
  assert.equal(
    result.blockers.filter((value) => value.startsWith('installed_dollar_manifest_contains_non_current:')).length,
    INSTALLED_REMOVED_DOLLAR_COMMANDS.length
  )
})

test('installed handoff report keeps retired probes aggregate-only and receipt-safe', () => {
  const rawCommand = {
    argv: ['/tmp/sks', INSTALLED_REMOVED_COMMANDS[0], '--json'],
    exit_code: 1,
    stdout_json: true,
    duration_ms: 3,
    stdout_tail: JSON.stringify({ command: INSTALLED_REMOVED_COMMANDS[0], reason: 'unknown_command' }),
    stderr_tail: `Unknown command: ${INSTALLED_REMOVED_COMMANDS[0]}`
  }
  const safeCommand = sanitizeInstalledSurfaceProbeCommand(rawCommand, 1, 'unknown_command')
  const probes = [
    ...INSTALLED_REMOVED_COMMANDS.map(() => ({ expected_reason: 'unknown_command' as const, exit_code: 1, observed_reason: 'unknown_command' as const, ok: true })),
    ...INSTALLED_REMOVED_DOLLAR_COMMANDS.map(() => ({ expected_reason: 'unknown_command' as const, exit_code: 1, observed_reason: 'unknown_command' as const, ok: true })),
    ...INSTALLED_REMOVED_ARGUMENT_PROBES.map((probe) => ({ expected_reason: probe.expected_reason, exit_code: 1, observed_reason: probe.expected_reason, ok: true })),
    ...INSTALLED_REMOVED_SUBCOMMAND_PROBES.map((probe) => ({ expected_reason: probe.expected_reason, exit_code: 1, observed_reason: probe.expected_reason, ok: true }))
  ]
  const closure = summarizeInstalledSurfaceClosure(probes)
  const serialized = JSON.stringify({ commands: [safeCommand], public_surface: { closure } })
  assert.deepEqual(retiredSurfaceTokenFindings(serialized), [])
  assert.equal(closure.rejected_count, probes.length)
  assert.equal(closure.argument_probe_count, INSTALLED_REMOVED_ARGUMENT_PROBES.length)
  assert.equal(closure.subcommand_probe_count, INSTALLED_REMOVED_SUBCOMMAND_PROBES.length)
  assert.equal(closure.all_rejected, true)
  assert.equal(closure.receipt_safe, true)
  assert.deepEqual(Object.keys(safeCommand).sort(), ['duration_ms', 'exit_code', 'probe', 'stdout_json'])
})

test('retired token scan covers removed options and nested command surfaces', () => {
  for (const value of ['--naruto', '--clones', 'naruto workers', 'menubar mcp']) {
    assert.ok(retiredSurfaceTokenFindings(`probe=${value}`).length > 0, value)
  }
})

test('installed handoff command summaries never persist raw argv or output tails', () => {
  const summary = summarizeInstalledSmokeCommand({
    argv: ['/tmp/sks', INSTALLED_REMOVED_COMMANDS[0], '--json'],
    exit_code: 1,
    stdout_json: true,
    duration_ms: 4,
    stdout_tail: JSON.stringify({ command: INSTALLED_REMOVED_COMMANDS[0], xai_required: false }),
    stderr_tail: `Unknown command: ${INSTALLED_REMOVED_COMMANDS[0]}`
  }, 'current_surface_closure_01')
  const serialized = JSON.stringify(summary)
  assert.deepEqual(retiredSurfaceTokenFindings(serialized), [])
  assert.deepEqual(summary, {
    probe: 'current_surface_closure_01',
    exit_code: 1,
    stdout_json: true,
    duration_ms: 4
  })
})

test('no-launch Menu Bar smoke validates installed bytes without requiring a running service', () => {
  assert.deepEqual(validateInstalledMenubarStatus({
    schema: 'sks.menubar-status.v1',
    ok: false,
    installed: true,
    running: false,
    launchd: { checked: true, ok: false, state: null },
    signature: { checked: true, ok: true },
    resources: { checked: true, ok: true }
  }, 'darwin'), [])
  assert.deepEqual(validateInstalledMenubarStatus({
    schema: 'sks.menubar-status.v1',
    installed: true,
    signature: { ok: false },
    resources: { ok: true }
  }, 'darwin'), ['installed_diagnostic_failed:menubar'])
})
