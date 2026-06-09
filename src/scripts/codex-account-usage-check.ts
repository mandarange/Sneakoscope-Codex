#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_ACCOUNT_USAGE_FAKE = '1'
const mod = await importDist('core/usage/codex-account-usage.js')
const usage = await mod.collectCodexAccountUsage()
assertGate(usage.ok === true && usage.source === 'fake' && usage.token_usage.total_tokens === 1500, 'Codex account usage telemetry must normalize app-server/fake token usage', usage)
emitGate('codex:account-usage', { source: usage.source, total_tokens: usage.token_usage.total_tokens })
