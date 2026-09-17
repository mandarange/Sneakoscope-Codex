import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { COMMANDS } from '../../../cli/command-registry.js'
import { COMMAND_MANIFEST_BY_NAME } from '../../../cli/command-manifest-lite.js'
import { COMMAND_CATALOG } from '../../routes.js'
import { UsageError, parseDecisionArgs, runDecisionCommand, usage } from '../../../commands/local-decision.js'

async function tempEnv(t: test.TestContext): Promise<NodeJS.ProcessEnv> {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-ld-cli-'))
  t.after(async () => fsp.rm(base, { recursive: true, force: true }))
  return { HOME: path.join(base, 'home'), SKS_HOME: path.join(base, 'sks-home'), PATH: process.env.PATH || '' }
}

function capture<T>(fn: () => Promise<T>): Promise<{ value: T; stdout: string; stderr: string }> {
  const out: string[] = []
  const err: string[] = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args: unknown[]) => { out.push(args.map(String).join(' ')) }
  console.error = (...args: unknown[]) => { err.push(args.map(String).join(' ')) }
  return fn().then((value) => ({ value, stdout: out.join('\n'), stderr: err.join('\n') })).finally(() => { console.log = originalLog; console.error = originalError })
}

test('decision is registered as a labs command with json support, no remote access, and its runtime entrypoint packaged', () => {
  const manifest = COMMAND_MANIFEST_BY_NAME.decision
  assert.equal(manifest.maturity, 'labs')
  assert.equal(manifest.remoteAllowed, false)
  assert.equal(manifest.supportsJson, true)
  assert.equal(manifest.readonly, undefined)
  assert.equal(COMMANDS.decision.ownsGates, undefined)
  assert.equal(COMMANDS.decision.mutatesRouteState, undefined)
  assert.deepEqual([...COMMANDS.decision.packageRequiredFiles], ['dist/commands/local-decision.js', 'dist/core/local-decision/service-entrypoint.js'])
  assert.ok(COMMAND_CATALOG.some((entry: any) => entry.name === 'decision'))
})

test('argument parsing rejects unknown options, kind mismatch, extra positionals and bad JSON', async (t) => {
  assert.throws(() => parseDecisionArgs(['status', '--verbose']), UsageError)
  assert.throws(() => parseDecisionArgs(['status', 'extra']), UsageError)
  assert.throws(() => parseDecisionArgs(['evaluate', '--kind']), UsageError)
  assert.throws(() => parseDecisionArgs(['mode', 'shadow', 'advisory']), UsageError)
  assert.throws(() => parseDecisionArgs(['bogus']), UsageError)
  assert.throws(() => parseDecisionArgs(['install', '--model=a/b', '--model', 'c/d']), UsageError)
  const parsed = parseDecisionArgs(['install', '--model=fake/weights', '--revision', 'x'.repeat(40), '--accept-license', '--yes', '--json'])
  assert.equal(parsed.values.get('--model'), 'fake/weights')
  assert.ok(parsed.flags.has('--yes'))
  const env = await tempEnv(t)
  const kind = await capture(() => runDecisionCommand(['evaluate', '--kind', 'release', '--input', '/nonexistent'], env))
  assert.equal(kind.value, 2)
  assert.match(kind.stderr, /--kind must be planning or recovery/)
  const file = path.join(env.SKS_HOME!, '..', 'bad.json')
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, '{not json')
  const bad = await capture(() => runDecisionCommand(['evaluate', '--kind', 'planning', '--input', file], env))
  assert.equal(bad.value, 2)
  assert.match(bad.stderr, /invalid JSON/)
  const help = await capture(() => runDecisionCommand(['--help'], env))
  assert.equal(help.value, 0)
  assert.match(help.stdout, /Usage: sks decision/)
  assert.match(usage(), /never type a placeholder/)
})

test('status and help touch no network, spawn nothing, and create no runtime root', async (t) => {
  const env = await tempEnv(t)
  const status = await capture(() => runDecisionCommand(['status', '--json'], env))
  assert.equal(status.value, 0)
  const report = JSON.parse(status.stdout)
  assert.equal(report.mode, 'off')
  assert.equal(report.installed, false)
  assert.equal(report.service.running, false)
  assert.equal(report.runtimeRoot, path.join(env.SKS_HOME!, 'local-decision'))
  assert.equal(report.recommended.modelId, 'mlx-community/Qwen2.5-1.5B-Instruct-4bit')
  assert.equal(report.recommended.appliedAutomatically, false)
  assert.equal(report.nextStep, process.platform === 'darwin' && process.arch === 'arm64' ? 'install' : 'unsupported')
  await assert.rejects(fsp.access(report.runtimeRoot))
  await assert.rejects(fsp.access(env.SKS_HOME!))
})

test('mode is user-scoped, defaults to off, and warns when nothing is installed', async (t) => {
  const env = await tempEnv(t)
  const set = await capture(() => runDecisionCommand(['mode', 'shadow', '--sample-rate', '0.25', '--json'], env))
  assert.equal(set.value, 0)
  const setReport = JSON.parse(set.stdout)
  assert.equal(setReport.mode, 'shadow')
  assert.equal(setReport.shadowSampleRate, 0.25)
  assert.ok(setReport.warnings.some((line: string) => line.includes('no model installed')))
  const configPath = path.join(env.SKS_HOME!, 'local-decision', 'config.json')
  assert.equal((await fsp.lstat(configPath)).mode & 0o077, 0)
  const get = await capture(() => runDecisionCommand(['mode', '--json'], env))
  assert.equal(JSON.parse(get.stdout).mode, 'shadow')
  const off = await capture(() => runDecisionCommand(['mode', 'off', '--json'], env))
  assert.equal(JSON.parse(off.stdout).mode, 'off')
  assert.deepEqual(JSON.parse(off.stdout).warnings, [])
  const bad = await capture(() => runDecisionCommand(['mode', 'auto'], env))
  assert.equal(bad.value, 2)
  const badRate = await capture(() => runDecisionCommand(['mode', 'shadow', '--sample-rate', '7'], env))
  assert.equal(badRate.value, 2)
})

test('explicit evaluate and start without a service report unavailable, never install or download', async (t) => {
  const env = await tempEnv(t)
  const file = path.join(env.SKS_HOME!, '..', 'recovery.json')
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, JSON.stringify({ summary: 'two node:test files failed after the slice', facts: { failedChecks: 2 } }))
  const started = Date.now()
  const evaluated = await capture(() => runDecisionCommand(['evaluate', '--kind', 'recovery', '--input', file, '--json'], env))
  assert.equal(evaluated.value, 1)
  assert.ok(Date.now() - started < 2_000)
  const report = JSON.parse(evaluated.stdout)
  assert.equal(report.ok, false)
  assert.equal(report.factsSource, 'user_supplied')
  assert.equal(report.completionEvidence, false)
  assert.equal(report.result.status, 'unavailable')
  assert.equal(report.result.reason, 'service_not_ready')
  assert.equal(report.policy.action, 'keep_baseline')
  await assert.rejects(fsp.access(path.join(env.SKS_HOME!, 'local-decision')))
  const start = await capture(() => runDecisionCommand(['start', '--json'], env))
  assert.equal(start.value, 1)
  assert.equal(JSON.parse(start.stdout).error, process.platform === 'darwin' && process.arch === 'arm64' ? 'model_missing' : JSON.parse(start.stdout).error)
  const stop = await capture(() => runDecisionCommand(['stop', '--json'], env))
  assert.equal(stop.value, 0)
  assert.equal(JSON.parse(stop.stdout).stopped, false)
  const uninstall = await capture(() => runDecisionCommand(['uninstall', '--json'], env))
  assert.equal(uninstall.value, 2)
  const install = await capture(() => runDecisionCommand(['install', '--model', 'a/b', '--revision', 'c'.repeat(40), '--json'], env))
  assert.equal(install.value, 2)
  assert.match(install.stderr, /--accept-license/)
})
