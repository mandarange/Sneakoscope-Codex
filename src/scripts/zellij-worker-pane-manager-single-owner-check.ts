#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'

const root = packageRoot()
const managerPath = path.join(root, 'src', 'core', 'zellij', 'zellij-worker-pane-manager.ts')
const nativePath = path.join(root, 'src', 'core', 'agents', 'native-cli-session-swarm.ts')
const manager = await fs.readFile(managerPath, 'utf8')
const native = await fs.readFile(nativePath, 'utf8')

const managerOwnsNewPane = /runZellij\(\[[\s\S]{0,500}'new-pane'/.test(manager)
const nativeDirectNewPane = /runZellij\(\[[\s\S]{0,500}'new-pane'/.test(native)
const nativeUsesManager = native.includes('openWorkerPane({') && native.includes('closeWorkerPane({')
const directionRight = manager.includes("'--direction', 'right'")
const fallbackRecorded = manager.includes("direction_applied: input.directionApplied") && manager.includes("directionApplied = 'unknown'")
const ok = managerOwnsNewPane && !nativeDirectNewPane && nativeUsesManager && directionRight && fallbackRecorded

emit({
  schema: 'sks.zellij-worker-pane-manager-single-owner-check.v1',
  ok,
  checks: {
    manager_owns_new_pane: managerOwnsNewPane,
    native_direct_new_pane_absent: !nativeDirectNewPane,
    native_uses_manager: nativeUsesManager,
    direction_right_requested: directionRight,
    fallback_recorded: fallbackRecorded
  },
  blockers: ok ? [] : [
    ...(!managerOwnsNewPane ? ['worker_pane_manager_new_pane_missing'] : []),
    ...(nativeDirectNewPane ? ['native_cli_session_swarm_direct_new_pane'] : []),
    ...(!nativeUsesManager ? ['native_cli_session_swarm_not_using_worker_pane_manager'] : []),
    ...(!directionRight ? ['zellij_worker_right_direction_missing'] : []),
    ...(!fallbackRecorded ? ['zellij_worker_direction_fallback_not_recorded'] : [])
  ]
})

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
