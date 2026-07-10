#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { evaluateCodexAppFastUiPreservation } from '../core/codex-app/codex-app-fast-ui-preservation.js'
import { snapshotCodexAppUiState } from '../core/codex-app/codex-app-ui-state-snapshot.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-ui-preservation-'))
const codexHome = path.join(tmp, 'home', '.codex')
await fs.mkdir(path.join(tmp, '.codex'), { recursive: true })
await fs.mkdir(codexHome, { recursive: true })
await fs.writeFile(path.join(tmp, '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\n')
await fs.writeFile(path.join(codexHome, 'config.toml'), '[features]\nfast_mode = true\n')
await fs.writeFile(path.join(codexHome, 'auth.json'), '{"access_token":"secret-should-not-leak","account_id":"acct_fixture"}\n')

const before = await snapshotCodexAppUiState(tmp, { codexHome })
const after = await snapshotCodexAppUiState(tmp, { codexHome })
const clean = await evaluateCodexAppFastUiPreservation(tmp, { before, after, codexHome })

const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-ui-preservation-bad-'))
await fs.mkdir(path.join(badRoot, '.codex'), { recursive: true })
await fs.mkdir(path.join(badRoot, 'home', '.codex'), { recursive: true })
await fs.writeFile(path.join(badRoot, '.codex', 'config.toml'), 'openai_base_url = "https://override.invalid"\n')
await fs.writeFile(path.join(badRoot, 'home', '.codex', 'config.toml'), '')
const bad = await evaluateCodexAppFastUiPreservation(badRoot, { codexHome: path.join(badRoot, 'home', '.codex') })

const serialized = JSON.stringify({ clean, bad })
const secretSafe = !serialized.includes('secret-should-not-leak')
const ok = clean.ok && !bad.ok && bad.project_local_forbidden_keys.includes('openai_base_url') && secretSafe
emit({ schema: 'sks.codex-app-fast-ui-preservation-check.v1', ok, clean, bad, secret_safe: secretSafe, blockers: ok ? [] : ['codex_app_fast_ui_preservation_check_failed'] })

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
