#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { providerBadgeText } from '../core/provider/provider-badge.js'
import { resolveProviderContext } from '../core/provider/provider-context.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-provider-context-'))
const codexHome = path.join(root, '.codex-home')
await fs.mkdir(codexHome, { recursive: true })
await fs.writeFile(path.join(codexHome, 'auth.json'), '{"account_id":"acct_fixture"}\n')

const openai = await resolveProviderContext({ root, codexHome, env: { OPENAI_API_KEY: 'sk-fixture', HOME: root } as any, route: '$Agent', serviceTier: 'fast' })
const lb = await resolveProviderContext({ root, codexHome, env: { CODEX_LB_API_KEY: 'lb-fixture', SKS_PROVIDER: 'codex-lb', HOME: root } as any, route: '$Naruto', serviceTier: 'fast' })
const app = await resolveProviderContext({ root, codexHome, env: { HOME: root } as any, route: '$Agent', serviceTier: 'standard' })
const conflict = await resolveProviderContext({ root, codexHome, env: { OPENAI_API_KEY: 'sk-fixture', CODEX_LB_API_KEY: 'lb-fixture', HOME: root } as any })
const ok = openai.provider === 'openai'
  && lb.provider === 'codex-lb'
  && app.provider === 'codex-app'
  && conflict.conflict
  && providerBadgeText(lb) === 'Provider: codex-lb · Fast'
emit({ schema: 'sks.provider-badge-context-check.v1', ok, openai, lb, app, conflict, blockers: ok ? [] : ['provider_badge_context_check_failed'] })

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
