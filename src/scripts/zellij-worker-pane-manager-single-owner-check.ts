#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'

const root = packageRoot()
const managerPath = path.join(root, 'src', 'core', 'zellij', 'zellij-worker-pane-manager.ts')
const nativePath = path.join(root, 'src', 'core', 'agents', 'native-cli-session-swarm.ts')
const manager = await fs.readFile(managerPath, 'utf8')
const native = await fs.readFile(nativePath, 'utf8')

const managerOwnsNewPane = /runZellij\(\[[\s\S]{0,800}'new-pane'/.test(manager)
  || (manager.includes("'new-pane'") && manager.includes('const newPaneArgs') && manager.includes('runZellij(newPaneArgs'))
const nativeDirectNewPane = /runZellij\(\[[\s\S]{0,500}'new-pane'/.test(native)
const nativeUsesManager = native.includes('openWorkerPane({') && native.includes('closeWorkerPane({')
const dynamicDirection = manager.includes("'--direction', directionRequested") && manager.includes("'--near-current-pane'")
const fallbackRecorded = manager.includes('worker_direction_applied')
  && manager.includes("directionApplied = rightColumn ? 'down' : 'unknown'")
  && manager.includes("directionApplied === 'down' ? 'down' : directionApplied === 'unknown' ? 'unknown' : 'not_applied'")
const slotAnchorOwned = manager.includes('buildZellijSlotColumnAnchorCommand')
  && manager.includes("recordSlotColumnAnchorInRightColumn")
  && manager.includes("'--direction', 'right', '--name', 'SLOTS'")
const ok = managerOwnsNewPane && !nativeDirectNewPane && nativeUsesManager && dynamicDirection && fallbackRecorded && slotAnchorOwned

emit({
  schema: 'sks.zellij-worker-pane-manager-single-owner-check.v1',
  ok,
  checks: {
    manager_owns_new_pane: managerOwnsNewPane,
    native_direct_new_pane_absent: !nativeDirectNewPane,
    native_uses_manager: nativeUsesManager,
	    dynamic_direction_requested: dynamicDirection,
	    fallback_recorded: fallbackRecorded,
	    slot_anchor_owned: slotAnchorOwned
  },
  blockers: ok ? [] : [
    ...(!managerOwnsNewPane ? ['worker_pane_manager_new_pane_missing'] : []),
    ...(nativeDirectNewPane ? ['native_cli_session_swarm_direct_new_pane'] : []),
	    ...(!nativeUsesManager ? ['native_cli_session_swarm_not_using_worker_pane_manager'] : []),
	    ...(!dynamicDirection ? ['zellij_worker_dynamic_direction_missing'] : []),
	    ...(!fallbackRecorded ? ['zellij_worker_direction_fallback_not_recorded'] : []),
	    ...(!slotAnchorOwned ? ['zellij_worker_slot_column_anchor_not_owned'] : [])
	  ]
	})

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
