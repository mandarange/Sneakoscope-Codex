#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess } from '../core/fsx.js'
import { ensureCodexNativeReferenceSnapshot } from '../core/codex-native/codex-native-reference-cache.js'
import { analyzeCodexNativeReferenceSource } from '../core/codex-native/codex-native-reference-source.js'

const missing = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-reference-cache-missing-'))
const missingReport = await ensureCodexNativeReferenceSnapshot({ root: missing, offline: true })
assertGate(missingReport.ok === false && missingReport.blockers.includes('source_snapshot_missing'), 'offline no-cache scenario must report source_snapshot_missing', missingReport)
const missingEvidence = await analyzeCodexNativeReferenceSource({ root: missing, writeReport: false })
assertGate(missingEvidence.blockers.includes('source_snapshot_missing') && missingEvidence.evidence.length === 0, 'missing cache must not hallucinate evidence', missingEvidence)

const reused = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-reference-cache-reused-'))
await fs.mkdir(path.join(reused, '.sneakoscope', 'cache', 'codex-native-reference'), { recursive: true })
await fs.writeFile(path.join(reused, '.sneakoscope', 'cache', 'codex-native-reference', 'README.md'), 'npx plugin hook agent_type fallback AGENTS.md doctor MCP managed proof\n', 'utf8')
const reusedReport = await ensureCodexNativeReferenceSnapshot({ root: reused, offline: true })
assertGate(reusedReport.ok === true && reusedReport.refreshed === false, 'offline existing cache should be reused', reusedReport)

const source = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-reference-source-'))
await fs.writeFile(path.join(source, 'README.md'), 'npx plugin hook agent_type fallback AGENTS.md doctor MCP managed proof\n', 'utf8')
await runProcess('git', ['init'], { cwd: source, timeoutMs: 10_000, maxOutputBytes: 64 * 1024 })
await runProcess('git', ['add', 'README.md'], { cwd: source, timeoutMs: 10_000, maxOutputBytes: 64 * 1024 })
await runProcess('git', ['-c', 'user.email=sks@example.invalid', '-c', 'user.name=SKS', 'commit', '-m', 'fixture'], { cwd: source, timeoutMs: 10_000, maxOutputBytes: 64 * 1024 })
const refreshedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-reference-cache-refresh-'))
const refreshed = await ensureCodexNativeReferenceSnapshot({ root: refreshedRoot, sourceUrl: source, refresh: true })
const serialized = JSON.stringify(refreshed)
assertGate(refreshed.ok === true && refreshed.refreshed === true && typeof refreshed.source_sha === 'string', 'refresh from local git source should record source sha', refreshed)
assertGate(!serialized.includes(source), 'cache report leaked raw source URL/path', refreshed)

const evidence = await analyzeCodexNativeReferenceSource({ root: refreshedRoot, writeReport: true })
const docs = await fs.readFile(path.join(refreshedRoot, 'docs', 'codex-native-patterns.md'), 'utf8')
assertGate(!JSON.stringify(evidence).includes(source) && !docs.includes(source), 'reference evidence/docs leaked raw source URL/path', { evidence, docs })
emitGate('codex-native:reference-cache-blackbox')

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
