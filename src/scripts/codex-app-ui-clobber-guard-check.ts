#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { codexAppUiMutationAllowed, evaluateCodexAppUiClobberGuard } from '../core/codex-app/codex-app-ui-clobber-guard.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ui-clobber-guard-'))
await fs.mkdir(path.join(root, '.codex'), { recursive: true })
await fs.writeFile(path.join(root, '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\n')
await fs.writeFile(path.join(root, 'package.json'), '{"scripts":{"postinstall":"node ./dist/bin/sks.js postinstall"}}\n')
const clean = await evaluateCodexAppUiClobberGuard(root)

await fs.writeFile(path.join(root, '.codex', 'config.toml'), 'model_provider = "codex-lb"\n')
const badProject = await evaluateCodexAppUiClobberGuard(root)

const defaultDenied = !codexAppUiMutationAllowed({ kind: 'codex_app_ui_state', scope: 'default' })
const repairAllowed = codexAppUiMutationAllowed({ kind: 'codex_app_ui_state', scope: 'codex-app-ui-repair', backupPath: path.join(root, 'backup.bak') })
const ok = clean.ok && !badProject.ok && defaultDenied && repairAllowed
emit({ schema: 'sks.codex-app-ui-clobber-guard-check.v1', ok, clean, bad_project: badProject, default_denied: defaultDenied, repair_allowed: repairAllowed, blockers: ok ? [] : ['codex_app_ui_clobber_guard_check_failed'] })

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
