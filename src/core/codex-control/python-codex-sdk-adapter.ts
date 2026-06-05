import { spawn } from 'node:child_process'
import path from 'node:path'
import { packageRoot, runProcess, which } from '../fsx.js'
import type { CodexTaskInput } from './codex-control-plane.js'
import { translatePythonCodexSdkEvents } from './python-codex-sdk-event-translator.js'

export async function detectPythonCodexSdkCapability() {
  const python = await resolvePythonCodexSdkPython()
  if (!python.path) return capability(false, null, '', ['python_missing'], null, 'Install Python >= 3.10 and install the Codex Python SDK.')
  const pyOk = parsePythonVersion(python.versionText) >= 3.10
  const probes: Array<Record<string, unknown>> = []
  let detected: PythonCodexSdkCandidate | null = null
  if (pyOk) {
    for (const candidate of PYTHON_CODEX_SDK_CANDIDATES) {
      const importProbe = await runProcess(python.path, ['-c', `import ${candidate.importName}; print("ok")`], { timeoutMs: 5000, maxOutputBytes: 4096 })
        .catch((err: any) => ({ code: 1, stdout: '', stderr: err.message || String(err) }))
      probes.push({
        package_name: candidate.packageName,
        import_name: candidate.importName,
        ok: importProbe.code === 0,
        stderr: String(importProbe.stderr || '').slice(-500)
      })
      if (importProbe.code === 0) {
        detected = candidate
        break
      }
    }
  }
  const blockers = [
    ...(pyOk ? [] : ['python_version_below_3_10']),
    ...(detected ? [] : ['python_codex_sdk_unavailable'])
  ]
  return capability(
    blockers.length === 0,
    python.path,
    python.versionText,
    blockers,
    detected,
    blockers.length ? setupAction(python.path) : null,
    probes
  )
}

export async function runPythonCodexSdkTask(input: CodexTaskInput, opts: {
  pythonBin?: string | null
  env?: Record<string, string>
  config?: Record<string, unknown>
} = {}) {
  const cap = await detectPythonCodexSdkCapability()
  if (!cap.ok && process.env.SKS_PYTHON_CODEX_SDK_FAKE !== '1') {
    return { ok: false, events: [], translatedEvents: [], finalResponse: '', blockers: cap.blockers, capability: cap }
  }
  const python = opts.pythonBin || cap.python_bin || await which('python3') || 'python3'
  const request = {
    schema: 'sks.python-codex-sdk-request.v1',
    route: input.route,
    thread_policy: input.requestedScopeContract?.resume_thread_id ? 'resume' : 'new',
    sandbox: mapSandbox(input.sandboxPolicy),
    cwd: input.cwd,
    model: typeof opts.config?.model === 'string' ? opts.config.model : '',
    model_reasoning_effort: typeof opts.config?.model_reasoning_effort === 'string' ? opts.config.model_reasoning_effort : 'minimal',
    prompt: input.prompt,
    output_schema: input.outputSchema || {}
  }
  const events = await runPythonRunner(python, request, opts.env)
  const translatedEvents = translatePythonCodexSdkEvents(events)
  const last = [...events].reverse().find((event: any) => event?.event === 'turn_completed') as any
  const errors = events.filter((event: any) => event?.event === 'error').map((event: any) => String(event.message || 'python_codex_sdk_error'))
  return {
    ok: errors.length === 0 && Boolean(last),
    events,
    translatedEvents,
    finalResponse: String(last?.final_response || ''),
    threadId: String(events.find((event: any) => event?.thread_id)?.thread_id || ''),
    turnId: String(last?.turn_id || ''),
    blockers: errors,
    capability: cap
  }
}

function runPythonRunner(python: string, request: unknown, envOverride?: Record<string, string>): Promise<any[]> {
  const runner = path.join(packageRoot(), 'pytools', 'codex_sdk_runner.py')
  return new Promise((resolve, reject) => {
    const child = spawn(python, [runner], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: envOverride ? { ...process.env, ...envOverride } : process.env,
      detached: process.platform !== 'win32'
    })
    const events: any[] = []
    let stderr = ''
    let timedOut = false
    const timeoutMs = Number(process.env.SKS_PYTHON_CODEX_SDK_TIMEOUT_MS || 120000)
    const timer = setTimeout(() => {
      timedOut = true
      events.push({ event: 'error', retryable: true, message: `python_codex_sdk_timeout:${timeoutMs}` })
      terminatePythonRunner(child)
    }, timeoutMs)
    timer.unref?.()
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      for (const line of String(chunk).split(/\n/).filter(Boolean)) {
        try {
          events.push(JSON.parse(line))
        } catch {
          events.push({ event: 'error', retryable: false, message: `invalid_python_jsonl:${line.slice(0, 200)}` })
        }
      }
    })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', () => {
      clearTimeout(timer)
      if (stderr.trim()) events.push({ event: 'stderr', message: stderr.slice(-1000) })
      if (timedOut && !events.some((event) => String(event?.message || '').startsWith('python_codex_sdk_timeout:'))) {
        events.push({ event: 'error', retryable: true, message: `python_codex_sdk_timeout:${timeoutMs}` })
      }
      resolve(events)
    })
    child.stdin.end(JSON.stringify(request))
  })
}

function terminatePythonRunner(child: ReturnType<typeof spawn>) {
  if (!child.pid) return
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch {
    try { child.kill('SIGTERM') } catch {}
  }
  setTimeout(() => {
    try {
      if (process.platform !== 'win32') process.kill(-child.pid!, 'SIGKILL')
      else child.kill('SIGKILL')
    } catch {}
  }, 5000).unref?.()
}

function mapSandbox(value: string) {
  if (value === 'workspace-write') return 'workspace_write'
  if (value === 'full-access') return 'full_access'
  return 'read_only'
}

function parsePythonVersion(text: string) {
  const match = text.match(/Python\s+(\d+)\.(\d+)/i)
  return match ? Number(`${match[1]}.${match[2]}`) : 0
}

async function resolvePythonCodexSdkPython() {
  const requested = [
    process.env.SKS_PYTHON_CODEX_SDK_PYTHON,
    process.env.PYTHON
  ].filter((value): value is string => Boolean(value && value.trim()))
  const candidates = [...requested, 'python3.12', 'python3.11', 'python3.10', 'python3', 'python']
  const seen = new Set<string>()
  const probes: Array<{ path: string, versionText: string, score: number }> = []
  for (const candidate of candidates) {
    const resolved = candidate.includes('/') ? candidate : await which(candidate)
    if (!resolved || seen.has(resolved)) continue
    seen.add(resolved)
    const version = await runProcess(resolved, ['--version'], { timeoutMs: 5000, maxOutputBytes: 4096 })
      .catch((err: any) => ({ code: 1, stdout: '', stderr: err.message || String(err) }))
    const versionText = `${version.stdout || ''}${version.stderr || ''}`.trim()
    probes.push({ path: resolved, versionText, score: parsePythonVersion(versionText) })
  }
  const supported = probes.find((probe) => probe.score >= 3.10)
  return supported || probes[0] || { path: null, versionText: '' }
}

interface PythonCodexSdkCandidate {
  packageName: string
  importName: string
  source: string
}

const PYTHON_CODEX_SDK_CANDIDATES: PythonCodexSdkCandidate[] = [
  { packageName: 'codex-app-server', importName: 'codex_app_server', source: 'developers.openai.com/codex/sdk' },
  { packageName: 'openai-codex', importName: 'openai_codex', source: 'sks-2.0.5-directive' },
  { packageName: 'openai-codex-sdk', importName: 'openai_codex_sdk', source: 'pypi-wheel' }
]

function setupAction(pythonBin: string) {
  return [
    `Install the current Codex Python SDK in \`${pythonBin}\`.`,
    'Preferred official source install: from the Codex repository root run `cd sdk/python && python -m pip install -e .`.',
    `If using the published wrapper package, run \`${pythonBin} -m pip install openai-codex-sdk\`.`,
    `If your environment provides the directive package, run \`${pythonBin} -m pip install openai-codex\`.`
  ].join(' ')
}

function capability(
  ok: boolean,
  pythonBin: string | null,
  versionText: string,
  blockers: string[],
  detected: PythonCodexSdkCandidate | null,
  setupActionValue: string | null,
  probes: Array<Record<string, unknown>> = []
) {
  const selected = detected || PYTHON_CODEX_SDK_CANDIDATES[0] || { packageName: 'codex-app-server', importName: 'codex_app_server', source: 'developers.openai.com/codex/sdk' }
  return {
    schema: 'sks.python-codex-sdk-capability.v1',
    ok,
    python_bin: pythonBin,
    python_version: versionText,
    package_name: selected.packageName,
    import_name: selected.importName,
    source: selected.source,
    supported_packages: PYTHON_CODEX_SDK_CANDIDATES.map((candidate) => candidate.packageName),
    supported_imports: PYTHON_CODEX_SDK_CANDIDATES.map((candidate) => candidate.importName),
    import_probes: probes,
    setup_action: setupActionValue,
    blockers
  }
}
