#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path'
import { spawn } from 'node:child_process'
import { writeJsonAtomic } from '../core/fsx.js'

const args = process.argv.slice(2)
const skipReleaseCheck = args.includes('--skip-release-check') || process.env.SKS_RELEASE_REAL_CHECK_SKIP_RELEASE_CHECK === '1'
const root = process.cwd()
const concurrency = Math.max(1, Math.floor(Number(process.env.SKS_RELEASE_REAL_CHECK_CONCURRENCY || 4)))

const report = {
  schema: 'sks.release-real-check.v1',
  generated_at: new Date().toISOString(),
  ok: false,
  pipeline_shape: {
    schema: 'sks.release-real-check-diamond.v1',
    stages: ['design', 'parallel_processing', 'parallel_verification', 'aggregation'],
    concurrency,
    dependency_model: 'dag-with-ordered-zellij-proof-chains'
  },
  release_check: null,
  environment_required_checks: [],
  real_smoke_checks: [],
  real_ui_checks: [],
  all_checks: [],
  phase_results: [],
  blockers: [],
  warnings: []
}

const tasks = [
  task('codex:actual-config-load-probe', 'codex:actual-config-load-probe', { group: 'environment_required', phase: 'parallel_processing' }),
  task('codex:0.137-compat:require-real', 'codex:0.137-compat:require-real', { group: 'environment_required', phase: 'parallel_processing', env: { SKS_REQUIRE_CODEX_0137: '1' } }),
  task('codex:0.136-compat:require-real', 'codex:0.136-compat:require-real', { group: 'environment_required', phase: 'parallel_processing' }),
  task('codex:0.135-compat:require-real', 'codex:0.135-compat:require-real', { group: 'environment_required', phase: 'parallel_processing' }),
  task('doctor:codex-doctor-parity:actual', 'doctor:codex-doctor-parity:actual', { group: 'environment_required', phase: 'parallel_processing' }),
  task('publish:dry-run-performance', 'publish:dry-run-performance', { group: 'environment_required', phase: 'parallel_processing' }),
  task('zellij:capability', 'zellij:capability', { group: 'environment_required', phase: 'parallel_processing', args: ['--require-real'], env: { SKS_REQUIRE_ZELLIJ: '1' } }),
  task('zellij:layout-valid', 'zellij:layout-valid', { group: 'environment_required', phase: 'parallel_processing', args: ['--require-real'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:capability'] }),

  task('zellij:real-session-launch:base', 'zellij:real-session-launch', { group: 'environment_required', phase: 'parallel_verification', args: ['--require-real', '--main-only', '--mission', 'M-release-real-zellij', '--session', 'sks-rrz'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:layout-valid'] }),
  task('zellij:pane-proof:base', 'zellij:pane-proof', { group: 'environment_required', phase: 'parallel_verification', args: ['--require-real', '--mission', 'M-release-real-zellij', '--session', 'sks-rrz', '--expected-lanes', '0'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:real-session-launch:base'] }),
  task('zellij:screen-proof:base', 'zellij:screen-proof', { group: 'environment_required', phase: 'parallel_verification', args: ['--require-real', '--main-only', '--mission', 'M-release-real-zellij'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:real-session-launch:base'] }),
  task('zellij:real-session-cleanup:base', 'zellij:real-session-cleanup', { group: 'environment_required', phase: 'aggregation', args: ['--mission', 'M-release-real-zellij', '--session', 'sks-rrz'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:pane-proof:base', 'zellij:screen-proof:base'] }),

  task('zellij:first-slot-down-stack:real', 'zellij:first-slot-down-stack:real', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:layout-valid'] }),
  task('zellij:right-column-real-geometry', 'zellij:right-column-real-geometry', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:layout-valid'] }),
  task('naruto:zellij-dynamic-right-column', 'naruto:zellij-dynamic-right-column', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:layout-valid'] }),
  task('zellij:worker-pane-real-ui:blackbox', 'zellij:worker-pane-real-ui:blackbox', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:layout-valid'] }),

  task('zellij:real-session-launch:extra', 'zellij:real-session-launch', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real', '--main-only', '--mission', 'M-release-real-zellij-extra', '--session', 'sks-rrz-extra'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:layout-valid'] }),
  task('zellij:pane-proof:extra', 'zellij:pane-proof', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real', '--mission', 'M-release-real-zellij-extra', '--session', 'sks-rrz-extra', '--expected-lanes', '0'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:real-session-launch:extra'] }),
  task('zellij:screen-proof:extra', 'zellij:screen-proof', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real', '--main-only', '--mission', 'M-release-real-zellij-extra'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:real-session-launch:extra'] }),
  task('zellij:real-session-cleanup:extra', 'zellij:real-session-cleanup', { group: 'real_ui', phase: 'aggregation', args: ['--mission', 'M-release-real-zellij-extra', '--session', 'sks-rrz-extra'], env: { SKS_REQUIRE_ZELLIJ: '1' }, deps: ['zellij:pane-proof:extra', 'zellij:screen-proof:extra'] }),

  task('naruto:worktree-coding:blackbox', 'naruto:worktree-coding:blackbox', { group: 'real_smoke', phase: 'parallel_processing', args: ['--require-real'], env: { SKS_REQUIRE_GIT_WORKTREE: '1' } }),
  task('codex-control:real-smoke', 'codex-control:real-smoke', { group: 'real_smoke', phase: 'parallel_processing', args: ['--require-real'] }),
  task('codex-sdk:real-smoke', 'codex-sdk:real-smoke', { group: 'real_smoke', phase: 'parallel_processing', args: ['--require-real'] }),
  task('local-llm:smoke', 'local-llm:smoke', { group: 'real_smoke', phase: 'parallel_processing', args: ['--require-real'], env: { SKS_REQUIRE_LOCAL_LLM: '1' } }),
  task('local-llm:throughput', 'local-llm:throughput', { group: 'real_smoke', phase: 'parallel_verification', env: { SKS_REQUIRE_LOCAL_LLM: '1' }, deps: ['local-llm:smoke'] }),
  task('local-llm:cache-performance', 'local-llm:cache-performance', { group: 'real_smoke', phase: 'parallel_verification', env: { SKS_REQUIRE_LOCAL_LLM: '1' }, deps: ['local-llm:smoke'] }),
  task('python-sdk:real-smoke', 'python-sdk:real-smoke', {
    group: 'real_smoke',
    phase: 'parallel_verification',
    env: { SKS_REQUIRE_PYTHON_CODEX_SDK: '1', SKS_PYTHON_CODEX_SDK_TIMEOUT_MS: '240000' },
    deps: ['codex-sdk:real-smoke', 'codex-control:real-smoke', 'agent:real-codex-in-zellij-worker-pane'],
    retries: 2,
    retryDelayMs: 1500
  }),
  task('codex:0.134-runner-truth', 'codex:0.134-runner-truth', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-patch-envelope-smoke', 'agent:real-codex-patch-envelope-smoke', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-parallel-workers', 'agent:real-codex-parallel-workers', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-parallel-workers-5', 'agent:real-codex-parallel-workers-5', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-parallel-workers-10', 'agent:real-codex-parallel-workers-10', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-parallel-workers-20', 'agent:real-codex-parallel-workers-20', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-dynamic-smoke-v2', 'agent:real-codex-dynamic-smoke-v2', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-dynamic-smoke', 'agent:real-codex-dynamic-smoke', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('agent:real-codex-in-zellij-worker-pane', 'agent:real-codex-in-zellij-worker-pane', { group: 'real_ui', phase: 'parallel_verification', args: ['--require-real'], deps: ['zellij:layout-valid'] }),
  task('imagegen:real-smoke', 'imagegen:real-smoke', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('ux-review:real-imagegen-smoke', 'ux-review:real-imagegen-smoke', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('ppt:real-imagegen-smoke', 'ppt:real-imagegen-smoke', { group: 'real_smoke', phase: 'parallel_processing' }),
  task('naruto:real-local-gpt-final-smoke', 'naruto:real-local-gpt-final-smoke', { group: 'real_smoke', phase: 'parallel_verification', env: { SKS_REQUIRE_LOCAL_LLM: '1', SKS_REQUIRE_GPT_FINAL: '1' }, deps: ['local-llm:smoke'] }),
  task('local-collab:gpt-final-performance', 'local-collab:gpt-final-performance', { group: 'real_smoke', phase: 'parallel_verification', env: { SKS_REQUIRE_LOCAL_LLM: '1', SKS_REQUIRE_GPT_FINAL: '1' }, deps: ['local-llm:smoke'] })
]

main().catch(async (err) => {
  report.blockers.push(`release_real_check_exception:${err?.message || String(err)}`)
  await finish(false)
})

async function main() {
  if (!skipReleaseCheck) {
    report.release_check = await runNpm(task('release:check', 'release:check', { group: 'design', phase: 'design' }))
    collect(report.release_check)
    if (!report.release_check.ok) return await finish(false)
  } else {
    report.release_check = {
      id: 'release:check',
      script: 'release:check',
      group: 'design',
      phase: 'design',
      ok: true,
      skipped: true,
      note: 'Skipped because caller already verified release:check in this workspace.'
    }
  }

  const result = await runDag(tasks, concurrency)
  report.all_checks = result.results
  report.environment_required_checks = result.results.filter((row) => row.group === 'environment_required')
  report.real_smoke_checks = result.results.filter((row) => row.group === 'real_smoke')
  report.real_ui_checks = result.results.filter((row) => row.group === 'real_ui')
  report.phase_results = summarizePhases(result.results)
  for (const row of result.results) collect(row)
  await finish(result.results.every((row) => row.ok))
}

function task(id, script, options = {}) {
  return {
    id,
    script,
    group: options.group || 'real_smoke',
    phase: options.phase || 'parallel_processing',
    args: options.args || [],
    env: options.env || {},
    deps: options.deps || [],
    retries: Number(options.retries || 0),
    retryDelayMs: Number(options.retryDelayMs || 0)
  }
}

async function runDag(taskList, maxConcurrency) {
  const pending = new Map(taskList.map((row) => [row.id, row]))
  const running = new Map()
  const completed = new Map()
  const results = []
  while (pending.size || running.size) {
    for (const [id, row] of [...pending]) {
      const failedDeps = row.deps.filter((dep) => completed.has(dep) && !completed.get(dep).ok)
      if (failedDeps.length) {
        pending.delete(id)
        const blocked = blockedResult(row, failedDeps)
        completed.set(id, blocked)
        results.push(blocked)
      }
    }
    const ready = [...pending.values()].filter((row) => row.deps.every((dep) => completed.get(dep)?.ok === true))
    while (running.size < maxConcurrency && ready.length) {
      const row = ready.shift()
      pending.delete(row.id)
      const promise = runNpm(row)
      running.set(row.id, promise)
    }
    if (!running.size) {
      if (pending.size) {
        for (const row of pending.values()) {
          const blocked = blockedResult(row, row.deps.filter((dep) => !completed.get(dep)?.ok))
          completed.set(row.id, blocked)
          results.push(blocked)
        }
        pending.clear()
      }
      continue
    }
    const result = await Promise.race([...running.values()])
    running.delete(result.id)
    completed.set(result.id, result)
    results.push(result)
  }
  return { results }
}

async function runNpm(row) {
  const maxAttempts = Math.max(1, Number(row.retries || 0) + 1)
  const attempts = []
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runNpmOnce(row, attempt)
    attempts.push(compactAttempt(result))
    if (result.ok || attempt >= maxAttempts) {
      return {
        ...result,
        attempt,
        attempts,
        retried: attempts.length > 1
      }
    }
    await sleep(Math.max(0, Number(row.retryDelayMs || 0)))
  }
}

function runNpmOnce(row, attempt) {
  const npmArgs = ['run', row.script, '--silent']
  if (row.args?.length) npmArgs.push('--', ...row.args)
  const started = Date.now()
  let stdout = ''
  let stderr = ''
  return new Promise((resolve) => {
    const child = spawn('npm', npmArgs, {
      cwd: root,
      env: { ...process.env, ...(row.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (chunk) => { stdout = appendTail(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = appendTail(stderr, chunk) })
    child.on('error', (err) => {
      resolve(normalizeResult(row, npmArgs, 1, null, { code: err.code, message: err.message }, stdout, stderr, Date.now() - started, attempt))
    })
    child.on('close', (code, signal) => {
      resolve(normalizeResult(row, npmArgs, code, signal, null, stdout, stderr, Date.now() - started, attempt))
    })
  })
}

function normalizeResult(row, npmArgs, code, signal, error, stdout, stderr, durationMs, attempt) {
  const parsed = parseJson(stdout)
  return {
    id: row.id,
    script: row.script,
    group: row.group,
    phase: row.phase,
    deps: row.deps || [],
    command: ['npm', ...npmArgs],
    ok: code === 0,
    attempt,
    exit_code: code,
    signal,
    duration_ms: durationMs,
    error,
    parsed_schema: parsed?.schema || null,
    parsed_ok: typeof parsed?.ok === 'boolean' ? parsed.ok : null,
    blockers: extractList(parsed, 'blockers'),
    warnings: extractList(parsed, 'warnings'),
    stdout_tail: tail(stdout),
    stderr_tail: tail(stderr)
  }
}

function compactAttempt(result) {
  return {
    attempt: result.attempt,
    ok: result.ok,
    exit_code: result.exit_code,
    duration_ms: result.duration_ms,
    blockers: result.blockers || [],
    stderr_tail: tail(result.stderr_tail || '', 600)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function blockedResult(row, failedDeps) {
  return {
    id: row.id,
    script: row.script,
    group: row.group,
    phase: row.phase,
    deps: row.deps || [],
    command: ['npm', 'run', row.script, '--silent'],
    ok: false,
    blocked: true,
    exit_code: null,
    signal: null,
    duration_ms: 0,
    error: null,
    parsed_schema: null,
    parsed_ok: null,
    blockers: failedDeps.map((dep) => `blocked_by_failed_dependency:${dep}`),
    warnings: [],
    stdout_tail: '',
    stderr_tail: `blocked by failed dependency: ${failedDeps.join(', ')}`
  }
}

function collect(result) {
  for (const blocker of result.blockers || []) {
    if (!report.blockers.includes(blocker)) report.blockers.push(blocker)
  }
  if (!result.ok && !(result.blockers || []).length) {
    const blocker = `${result.id.replace(/[^A-Za-z0-9]+/g, '_')}_failed`
    if (!report.blockers.includes(blocker)) report.blockers.push(blocker)
  }
  for (const warning of result.warnings || []) {
    if (!report.warnings.includes(warning)) report.warnings.push(warning)
  }
}

function summarizePhases(results) {
  return ['design', 'parallel_processing', 'parallel_verification', 'aggregation'].map((phase) => {
    const rows = phase === 'design' ? [report.release_check].filter(Boolean) : results.filter((row) => row.phase === phase)
    return {
      phase,
      total: rows.length,
      passed: rows.filter((row) => row.ok).length,
      failed: rows.filter((row) => !row.ok).length,
      duration_ms: rows.reduce((sum, row) => sum + Number(row.duration_ms || 0), 0)
    }
  })
}

async function finish(ok) {
  report.ok = ok && report.blockers.length === 0
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'release-real-check.json'), report)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

function parseJson(text) {
  const value = String(text || '').trim()
  if (!value) return null
  const start = value.indexOf('{')
  if (start < 0) return null
  try {
    return JSON.parse(value.slice(start))
  } catch {
    return null
  }
}

function extractList(parsed, key) {
  if (!parsed || typeof parsed !== 'object') return []
  const values = []
  const top = parsed[key]
  const nested = parsed.report && typeof parsed.report === 'object' ? parsed.report[key] : null
  for (const list of [top, nested]) {
    if (Array.isArray(list)) values.push(...list)
  }
  return [...new Set(values)]
}

function appendTail(previous, chunk, limit = 50 * 1024) {
  const text = previous + String(chunk || '')
  return text.length <= limit ? text : text.slice(-limit)
}

function tail(value, limit = 4000) {
  const text = String(value || '')
  return text.length <= limit ? text : text.slice(-limit)
}
