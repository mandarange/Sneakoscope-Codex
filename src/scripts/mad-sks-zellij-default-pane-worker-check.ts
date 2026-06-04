#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'

const root = packageRoot()
const mad = await fs.readFile(path.join(root, 'src', 'core', 'commands', 'mad-sks-command.ts'), 'utf8')
const parser = await fs.readFile(path.join(root, 'src', 'core', 'agents', 'agent-command-surface.ts'), 'utf8')
const swarm = await fs.readFile(path.join(root, 'src', 'core', 'agents', 'native-cli-session-swarm.ts'), 'utf8')
const manager = await fs.readFile(path.join(root, 'src', 'core', 'zellij', 'zellij-worker-pane-manager.ts'), 'utf8')

const commandBody = mad.slice(mad.indexOf('export async function madHighCommand'), mad.indexOf('export async function startMadNativeSwarm'))
const launchIndex = commandBody.indexOf('launchMadZellijUi(')
const swarmIndex = commandBody.indexOf('startMadNativeSwarm(')

const checks = {
  no_runtime_enable_profile: !commandBody.includes('enableMadHighProfile('),
  read_only_launch_profile: mad.includes('buildMadHighLaunchProfileNoWrite()'),
  preflight_fix_default_false: mad.includes('fix: allowMadRepair'),
  zellij_session_before_swarm: launchIndex >= 0 && swarmIndex >= 0 && launchIndex < swarmIndex,
  main_only_session: mad.includes('slotCount: 0'),
  zellij_default_backend: /return 'zellij'/.test(mad) && mad.includes("list.includes('--json')") && mad.includes("list.includes('--no-attach')"),
  worker_command_real_zellij: mad.includes("command.push('--real')") && mad.includes("command.push('--zellij-session-name'") && mad.includes("command.push('--zellij-pane-worker')"),
  parser_accepts_worker_flags: parser.includes('--zellij-session-name') && parser.includes('--zellij-pane-worker') && parser.includes('--no-zellij-pane-worker'),
  native_worker_pane_path: swarm.includes("this.input.backend === 'zellij'") && swarm.includes('ctx.opts.zellijPaneWorker !== false') && swarm.includes('openWorkerPane({'),
  right_pane_requested: manager.includes("'--direction', 'right'")
}
const ok = Object.values(checks).every(Boolean)

emit({
  schema: 'sks.mad-sks-zellij-default-pane-worker-check.v1',
  ok,
  checks,
  blockers: ok ? [] : Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
})

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
