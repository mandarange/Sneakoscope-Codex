#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { packageRoot } from '../core/fsx.js'
import { probePythonTools } from '../core/python-tools/python-tool-runner.js'

const root = packageRoot()
const probe = await probePythonTools(root)
const helper = path.join(root, 'pytools', 'jsonl_summary.py')
const smoke = {
  attempted: false,
  skipped: probe.python_bin === null,
  ok: probe.python_bin === null,
  stdout: '',
  stderr: ''
}

if (probe.python_bin) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-python-tools-smoke-'))
  const input = path.join(dir, 'events.jsonl')
  await fs.writeFile(input, '{"event":"heartbeat","slot":1}\n{"event":"result","ok":true}\n', 'utf8')
  const result = await run(probe.python_bin, [helper, input], root)
  smoke.attempted = true
  smoke.stdout = result.stdout.trim()
  smoke.stderr = result.stderr.trim()
  try {
    const parsed = JSON.parse(smoke.stdout)
    smoke.ok = result.exitCode === 0 && parsed.ok === true && parsed.lines === 2
  } catch {
    smoke.ok = false
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

const ok = probe.ok && smoke.ok && probe.core_runtime_requires_python === false
emit({
  schema: 'sks.python-tools-smoke-check.v1',
  ok,
  optional: true,
  python_bin: probe.python_bin,
  core_runtime_requires_python: probe.core_runtime_requires_python,
  pytools_present: probe.ok,
  jsonl_summary_smoke: smoke,
  blockers: ok ? [] : ['python_tools_smoke_failed']
})

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

function run(command: string, args: string[], cwd: string): Promise<{ exitCode: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` })
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({ exitCode, stdout, stderr })
    })
  })
}
