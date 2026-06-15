#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ensureCodexNativeReferenceSnapshot } from '../core/codex-native/codex-native-reference-cache.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-reference-cache-check-'))
await fs.mkdir(path.join(root, '.sneakoscope', 'cache', 'codex-native-reference'), { recursive: true })
await fs.writeFile(path.join(root, '.sneakoscope', 'cache', 'codex-native-reference', 'README.md'), 'npx plugin hook agent_type fallback AGENTS.md doctor MCP managed proof\n', 'utf8')
const report = await ensureCodexNativeReferenceSnapshot({ root, offline: true })
assertGate(report.schema === 'sks.codex-native-reference-cache.v1', 'reference cache schema mismatch', report)
assertGate(report.ok === true && report.offline === true && report.refreshed === false, 'offline cache reuse should pass', report)
assertGate(report.source_url_hash === null, 'offline cache check should not invent source URL hash', report)
emitGate('codex-native:reference-cache', { cache_dir: report.cache_dir })

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate, ...detail }, null, 2))
}
