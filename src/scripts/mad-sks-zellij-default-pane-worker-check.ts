#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'

const root = packageRoot()
const mad = await fs.readFile(path.join(root, 'src', 'core', 'commands', 'mad-sks-command.ts'), 'utf8')

const commandBody = mad.slice(mad.indexOf('export async function madHighCommand'), mad.indexOf('export async function settleMadLaunchLifecycle'))
const launchIndex = commandBody.indexOf('launchMadZellijUi(')

const checks = {
  no_runtime_enable_profile: !commandBody.includes('enableMadHighProfile('),
  read_only_launch_profile: mad.includes('buildMadHighLaunchProfileNoWrite()'),
  preflight_fix_default_false: mad.includes('fix: allowMadRepair'),
  zellij_launch_present: launchIndex >= 0,
  official_host_mission_bound: mad.includes('[SKS_ZELLIJ_HOST_MISSION_ENV]: madLaunch.mission_id'),
  main_only_session: mad.includes('slotCount: 0'),
  current_cockpit_topology: mad.includes("initial_panes: 'orchestrator-monitor-viewports'")
    && mad.includes('worker_panes_created: 0')
    && mad.includes("ui_architecture: 'monitor_plus_viewports'"),
  viewport_count_bounded: mad.includes('Math.max(0, Math.min(Number(zellijViewportSetting || 1), 3))'),
  current_attach_behavior: mad.includes('shouldAutoAttachZellij(args)')
    && mad.includes("list.includes('--no-attach')")
    && mad.includes("list.includes('--json')")
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
