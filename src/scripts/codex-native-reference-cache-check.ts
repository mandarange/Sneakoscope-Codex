#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureCodexNativeReferenceSnapshot } from '../core/codex-native/codex-native-reference-cache.js'

const currentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-reference-cache-check-'))
await fs.mkdir(path.join(root, '.sneakoscope', 'cache', 'codex-native-reference'), { recursive: true })
const seedText = 'npx optional tooling no global install. plugin install enable marketplace lifecycle. hook approval trust. skill command picker slash command $Loop. agent_type fallback. AGENTS.md directory-local project memory. plan work proof. continuation resume stop hook. doctor readiness matrix. MCP tool candidate server candidate. non-clobber managed preserve user checksum.\n'
await fs.writeFile(path.join(root, '.sneakoscope', 'cache', 'codex-native-reference', 'README.md'), seedText, 'utf8')
const report = await ensureCodexNativeReferenceSnapshot({ root, offline: true })
assertGate(report.schema === 'sks.codex-native-reference-cache.v1', 'reference cache schema mismatch', report)
assertGate(report.ok === true && report.offline === true && report.refreshed === false, 'offline cache reuse should pass', report)
assertGate(report.source_url_hash === null, 'offline cache check should not invent source URL hash', report)
await fs.mkdir(path.join(currentRoot, '.sneakoscope', 'cache', 'codex-native-reference'), { recursive: true })
await fs.writeFile(path.join(currentRoot, '.sneakoscope', 'cache', 'codex-native-reference', 'README.md'), seedText, 'utf8')
const currentReport = await ensureCodexNativeReferenceSnapshot({ root: currentRoot, offline: true })
assertGate(currentReport.ok === true, 'current reference cache report should be generated', currentReport)
emitGate('codex-native:reference-cache', { cache_dir: report.cache_dir })

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate, ...detail }, null, 2))
}
