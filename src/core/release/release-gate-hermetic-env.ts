import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import type { ReleaseGateNode } from './release-gate-node.js'

export interface ReleaseGateHermeticEnv {
  env: NodeJS.ProcessEnv
  tmp_dir: string
  report_dir: string
}

export function createReleaseGateHermeticEnv(input: {
  root: string
  runId: string
  gate: ReleaseGateNode
  reportRoot: string
}): ReleaseGateHermeticEnv {
  const safeId = input.gate.id.replace(/[^a-zA-Z0-9._-]+/g, '-')
  const tmpRoot = path.join(os.tmpdir(), 'sks-gate', input.runId, safeId)
  const home = path.join(tmpRoot, 'home')
  const codexHome = path.join(tmpRoot, 'codex-home')
  const cacheHome = path.join(tmpRoot, 'xdg-cache')
  const reportDir = path.join(input.reportRoot, safeId)
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(codexHome, { recursive: true })
  fs.mkdirSync(cacheHome, { recursive: true })
  fs.mkdirSync(reportDir, { recursive: true })
  return {
    tmp_dir: tmpRoot,
    report_dir: reportDir,
    env: {
      ...process.env,
      SKS_GATE_ID: input.gate.id,
      SKS_GATE_RUN_ID: input.runId,
      SKS_REPORT_DIR: reportDir,
      SKS_TMP_DIR: tmpRoot,
      HOME: input.gate.isolation.home === 'temp' ? home : process.env.HOME,
      CODEX_HOME: input.gate.isolation.codex_home === 'temp' ? codexHome : process.env.CODEX_HOME,
      XDG_CACHE_HOME: cacheHome,
      SKS_DISABLE_REAL_MODEL_CALLS: input.gate.preset.includes('real-check') ? process.env.SKS_DISABLE_REAL_MODEL_CALLS || '0' : '1',
      SKS_DISABLE_GLOBAL_CONFIG_MUTATION: '1',
      // Gates must never spawn a real GUI menu bar status item into the user's
      // live session. Belt to the temp-path launch guard in installSksMenuBar.
      SKS_SKIP_SKS_MENUBAR_LAUNCH: '1'
    }
  }
}
