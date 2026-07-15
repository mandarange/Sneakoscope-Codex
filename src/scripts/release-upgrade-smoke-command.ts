import { spawn } from 'node:child_process'
import type {
  ReleaseUpgradeCommandReceipt,
  ReleaseUpgradeCommandResult,
  ReleaseUpgradeCommandRunner,
  ReleaseUpgradeCommandSpec,
  ReleaseUpgradeIsolation,
  ReleaseUpgradeLifecycleInput
} from './release-upgrade-smoke-contract.js'
import { boundedTail, hashText, parseJson, redact } from './release-upgrade-smoke-utils.js'

export async function runReleaseUpgradeCommand(
  spec: ReleaseUpgradeCommandSpec
): Promise<ReleaseUpgradeCommandResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: timedOut ? 124 : code, stdout, stderr, timedOut, durationMs: Date.now() - started })
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1_500).unref?.()
    }, spec.timeoutMs)
    timer.unref?.()
    child.stdout?.on('data', (chunk: Buffer) => { stdout = boundedTail(stdout, chunk.toString(), 1024 * 1024) })
    child.stderr?.on('data', (chunk: Buffer) => { stderr = boundedTail(stderr, chunk.toString(), 1024 * 1024) })
    child.on('error', (error) => {
      stderr = boundedTail(stderr, error.message, 1024 * 1024)
      finish(-1)
    })
    child.on('close', finish)
  })
}

export async function runLifecycleCommand(
  input: ReleaseUpgradeLifecycleInput,
  runner: ReleaseUpgradeCommandRunner,
  commands: ReleaseUpgradeCommandReceipt[],
  stage: string,
  commandName: string,
  args: string[]
): Promise<ReleaseUpgradeCommandResult> {
  const spec: ReleaseUpgradeCommandSpec = {
    stage,
    command: commandName,
    args,
    cwd: input.isolation.workspace,
    env: input.isolation.env,
    timeoutMs: stage.includes('menubar') ? 10 * 60_000 : stage.includes('doctor') ? 5 * 60_000 : 3 * 60_000
  }
  let result: ReleaseUpgradeCommandResult
  try {
    result = await runner(spec)
  } catch (error) {
    result = {
      code: -1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      timedOut: false,
      durationMs: 0
    }
  }
  commands.push(commandReceipt(spec, result, input.isolation))
  return result
}

function commandReceipt(
  spec: ReleaseUpgradeCommandSpec,
  result: ReleaseUpgradeCommandResult,
  isolation: ReleaseUpgradeIsolation
): ReleaseUpgradeCommandReceipt {
  const json = parseJson(result.stdout) as Record<string, unknown> | null
  return {
    stage: spec.stage,
    argv: [spec.command, ...spec.args],
    cwd: spec.cwd,
    isolated_home: isolation.home,
    isolated_codex_home: isolation.codexHome,
    isolated_npm_cache: isolation.npmCache,
    isolated_npm_prefix: isolation.npmPrefix,
    exit_code: result.code,
    timed_out: result.timedOut,
    duration_ms: result.durationMs,
    stdout_sha256: hashText(result.stdout),
    stderr_sha256: hashText(result.stderr),
    stdout_tail: redact(boundedTail('', result.stdout, 2_000)),
    stderr_tail: redact(boundedTail('', result.stderr, 2_000)),
    json_schema: typeof json?.schema === 'string' ? json.schema : null,
    json_ok: typeof json?.ok === 'boolean' ? json.ok : null,
    report_file: null
  }
}
