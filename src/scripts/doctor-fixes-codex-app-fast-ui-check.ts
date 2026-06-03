#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { repairCodexAppFastUi } from '../core/codex-app/codex-app-fast-ui-repair.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-fast-ui-'))
const codexHome = path.join(root, 'home', '.codex')
await fs.mkdir(path.join(root, '.codex'), { recursive: true })
await fs.mkdir(codexHome, { recursive: true })
await fs.writeFile(path.join(root, '.codex', 'config.toml'), 'model_provider = "codex-lb"\n')
await fs.writeFile(path.join(codexHome, 'config.toml'), '# SKS forced fast UI during legacy install\nservice_tier = "fast"\n[features]\nfast_mode = false # user disabled, must remain untouched\n')

const plan = await repairCodexAppFastUi(root, { codexHome, apply: false })
const repaired = await repairCodexAppFastUi(root, { codexHome, apply: true })
const projectAfter = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8')
const homeAfter = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8')
const backups = repaired.actions.filter((action: any) => action.changed).map((action: any) => action.backup_path).filter(Boolean)
const ok = plan.fast_selector === 'manual_action_required'
  && repaired.fast_selector === 'repaired'
  && backups.length >= 2
  && !/model_provider\s*=/.test(projectAfter)
  && !/service_tier\s*=/.test(homeAfter)
  && /fast_mode = false/.test(homeAfter)
emit({ schema: 'sks.doctor-fixes-codex-app-fast-ui-check.v1', ok, plan, repaired, project_after: projectAfter, home_after: homeAfter, blockers: ok ? [] : ['doctor_fixes_codex_app_fast_ui_check_failed'] })

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
