import { spawnSync } from 'node:child_process'
import { flag } from '../../cli/args.js'
import { printJson } from '../../cli/output.js'
import { projectRoot } from '../fsx.js'
import { evaluateGateProcessOutput } from './gate-result-contract.js'

export async function gatesCommand(args: string[] = []): Promise<unknown> {
  const root = await projectRoot()
  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'run'
  const json = flag(args, '--json')
  if (sub !== 'run') {
    const result = { schema: 'sks.gates-command.v1', ok: false, error: `Unknown subcommand: ${sub}` }
    if (json) return printJson(result)
    console.error('Usage: sks gates run <gate-id|preset> [--full] [--json]')
    process.exitCode = 1
    return result
  }
  const target = args[1] && !args[1].startsWith('-') ? args[1] : readArg(args, '--preset', 'affected')
  const isPreset = ['release', 'affected', 'fast', 'harness'].includes(target) || flag(args, '--preset')
  const runnerArgs = ['dist/scripts/release-gate-dag-runner.js']
  if (isPreset) runnerArgs.push('--preset', target)
  else runnerArgs.push('--gate', target)
  if (flag(args, '--full')) runnerArgs.push('--full')
  const result = spawnSync(process.execPath, runnerArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: { ...process.env, CI: process.env.CI || 'true' }
  })
  const gateEval = evaluateGateProcessOutput({ status: result.status, stdout: String(result.stdout || '') })
  const report = {
    schema: 'sks.gates-command.v1',
    ok: gateEval.ok,
    target,
    mode: isPreset ? 'preset' : 'gate',
    status: result.status,
    contract: gateEval.contract,
    gate_result: gateEval.gate_result,
    ...(gateEval.reason ? { reason: gateEval.reason } : {}),
    stdout_tail: tail(String(result.stdout || '')),
    stderr_tail: tail(String(result.stderr || ''))
  }
  if (json) return printJson(report)
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (!report.ok) process.exitCode = result.status || 1
  return report
}

function readArg(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback
}

function tail(value: string, limit = 4000): string {
  return value.length > limit ? value.slice(-limit) : value
}
