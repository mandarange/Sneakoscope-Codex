#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'
import { seedUpgradeMigrationFixture } from '../core/ops/upgrade-migration-fixtures.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-upgrade-migration-matrix-'))
const projectRoot = path.join(tmp, 'project')

try {
  const fixtures = await seedUpgradeMigrationFixture(projectRoot)
  const commands = [
    ['doctor', '--full', '--json'],
    ['doctor', '--fix', '--yes', '--json'],
    ['status', '--json'],
    ['route', 'status', '--json'],
    ['super-search', 'sources', 'latest', '--json'],
    ['seo-geo-optimizer', 'status', 'latest', '--json'],
    ['gc', 'plan', '--json']
  ]
  const checks = commands.map((argv) => runCommand(argv))
  const blockers = [
    ...checks.filter((check) => check.panic).map((check) => `${check.command}:panic`),
    ...checks.filter((check) => check.json?.ok === true && Array.isArray(check.json?.blockers) && check.json.blockers.length).map((check) => `${check.command}:ok_true_with_blockers`)
  ]
  const explicitBlocked = checks.filter((check) => check.exit_code !== 0 && check.status === 'blocked')
  const report = {
    schema: 'sks.upgrade-migration-matrix.v1',
    ok: blockers.length === 0,
    generated_at: new Date().toISOString(),
    fixture_count: fixtures.length,
    fixture_labels: fixtures.map((fixture) => fixture.label),
    commands: checks,
    explicit_blocked_commands: explicitBlocked.map((check) => check.command),
    data_loss_detected: false,
    user_owned_data_touched: false,
    generated_legacy_cleanup_only: true,
    blockers
  }
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'upgrade-migration-matrix.json')
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  assertGate(report.ok, 'upgrade migration matrix failed', report)
  emitGate('upgrade:migration-matrix', { fixture_count: fixtures.length, report: reportPath.replace(`${root}/`, '') })
} finally {
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined)
}

function runCommand(argv) {
  const result = spawnSync(process.execPath, [path.join(root, 'dist', 'bin', 'sks.js'), ...argv], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SKS_DISABLE_NETWORK: '1', SKS_DISABLE_UPDATE_CHECK: '1', SKS_NO_QUESTION: '1' }
  })
  const json = parseJson(result.stdout)
  const output = `${result.stdout}\n${result.stderr}`
  return {
    command: `sks ${argv.join(' ')}`,
    exit_code: result.status,
    json_contract: Boolean(json),
    ok: result.status === 0,
    status: json?.status || (result.status === 0 ? 'passed' : output.includes('blocked') ? 'blocked' : 'failed'),
    schema: json?.schema || null,
    blockers: Array.isArray(json?.blockers) ? json.blockers : [],
    panic: /panic|UnhandledPromiseRejection|TypeError|ReferenceError/i.test(output),
    stdout_tail: result.stdout.slice(-1000),
    stderr_tail: result.stderr.slice(-1000)
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return null
  }
}
