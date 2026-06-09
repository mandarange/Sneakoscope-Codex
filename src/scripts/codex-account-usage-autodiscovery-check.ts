#!/usr/bin/env node
// @ts-nocheck
import http from 'node:http'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ account_id: 'fixture', token_usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 }, usage_limit_tokens: 100 }))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
process.env.CODEX_APP_SERVER_USAGE_URL = `http://127.0.0.1:${port}/usage`
const mod = await importDist('core/usage/codex-account-usage.js')
const usage = await mod.collectCodexAccountUsage()
server.close()
assertGate(usage.ok === true && usage.attempted_sources.includes('CODEX_APP_SERVER_USAGE_URL') && usage.token_usage.total_tokens === 3, 'account usage auto-discovery must record attempted sources and normalize usage')
delete process.env.CODEX_APP_SERVER_USAGE_URL
delete process.env.SKS_CODEX_APP_SERVER_USAGE_URL
process.env.CODEX_BIN = '/bin/false'
const unavailable = await mod.collectCodexAccountUsage()
assertGate(unavailable.ok === false && unavailable.source === 'unavailable' && unavailable.token_usage === null, 'unavailable account usage must not be reported as ok', unavailable)
emitGate('codex:account-usage-autodiscovery', { attempted_sources: usage.attempted_sources })
