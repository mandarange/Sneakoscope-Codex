#!/usr/bin/env node
import { runProcess } from '../core/fsx.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const ls = await runProcess('git', ['ls-files'], { maxOutputBytes: 2 * 1024 * 1024 })
const files = String(ls.stdout || '').split(/\r?\n/).filter(Boolean)
const allowedSneakoscope = /^\.sneakoscope\/(?:git-policy\.json|shared-memory-manifest\.json|wiki\/(?:avoidance-rules|wrongness)\/)/
const runtimeEvidence = files.filter((file) => file.startsWith('.sneakoscope/') && !allowedSneakoscope.test(file))
const leakScanFiles = files.filter((file) => !/^(src\/|test\/|docs\/|README\.md$|CHANGELOG\.md$|\.gitignore$|\.npmignore$)/.test(file))
const grep = leakScanFiles.length ? await runProcess('git', ['grep', '-nE', '(/Users/[^/[:space:]]+|/home/[^/[:space:]]+|[A-Za-z]:\\\\Users\\\\|auth\\.json|\\.npmrc|request[_-]?id|hostname)', '--', ...leakScanFiles], {
  maxOutputBytes: 512 * 1024
}).catch(() => ({ code: 1, stdout: '', stderr: '' })) : { code: 1, stdout: '', stderr: '' }
const leaks = String(grep.stdout || '').split(/\r?\n/).filter(Boolean)
const report = {
  schema: 'sks.machine-local-evidence-zero-check.v1',
  tracked_runtime_evidence_count: runtimeEvidence.length,
  sample_runtime_evidence: runtimeEvidence.slice(0, 20),
  leak_count: leaks.length,
  leak_sample: leaks.slice(0, 20)
}

assertGate(runtimeEvidence.length === 0 && leaks.length === 0, 'tracked machine-local runtime evidence and local path leaks must be zero', report)
emitGate('git:machine-local-evidence-zero', report)
