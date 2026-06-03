import type { CodexTaskInput } from './codex-control-plane.js'
import { buildCodexSdkConfig } from './codex-sdk-config-policy.js'
import { buildCodexSdkEnv } from './codex-sdk-env-policy.js'
import type { CodexSdkSandboxMode } from './codex-sdk-sandbox-policy.js'

export async function runRealCodexSdkTask(input: CodexTaskInput, policy: {
  sandboxMode: CodexSdkSandboxMode
  env: Record<string, string>
  config: Record<string, unknown>
}) {
  const mod: any = await import('@openai/codex-sdk')
  const Codex = mod.Codex || mod.default?.Codex || mod.default
  if (typeof Codex !== 'function') throw new Error('Codex SDK export Codex not found')
  const codex = new Codex({
    env: policy.env,
    config: policy.config
  })
  const threadOptions = {
    workingDirectory: input.cwd,
    sandboxMode: policy.sandboxMode,
    approvalPolicy: 'never',
    skipGitRepoCheck: true,
    networkAccessEnabled: policy.sandboxMode !== 'read-only'
  }
  const resumeId = typeof input.requestedScopeContract?.resume_thread_id === 'string'
    ? input.requestedScopeContract.resume_thread_id
    : null
  const thread = resumeId ? codex.resumeThread(resumeId, threadOptions) : codex.startThread(threadOptions)
  const events: any[] = []
  let finalResponse = ''
  const streamed = await thread.runStreamed(buildSdkInput(input), { outputSchema: input.outputSchema })
  for await (const event of streamed.events) {
    events.push(event)
    if (event?.type === 'item.completed' && event?.item?.type === 'agent_message') finalResponse = String(event.item.text || '')
  }
  const structuredOutput = parseStructuredOutput(finalResponse)
  return {
    ok: true,
    sdkThreadId: String(thread.id || events.find((event) => event?.type === 'thread.started')?.thread_id || ''),
    sdkRunId: extractRunId(events),
    events,
    finalResponse,
    structuredOutput,
    blockers: [],
    raw: { item_count: events.filter((event) => String(event?.type || '').startsWith('item.')).length }
  }
}

export function codexSdkRuntimePolicies(input: CodexTaskInput) {
  const env = buildCodexSdkEnv(input)
  const config = buildCodexSdkConfig(input)
  return { env, config }
}

function buildSdkInput(input: CodexTaskInput): any {
  const text = [
    input.prompt,
    input.inputFiles?.length ? `\nInput files:\n${input.inputFiles.map((file) => `- ${file}`).join('\n')}` : ''
  ].filter(Boolean).join('\n')
  const images = input.inputImages || []
  if (!images.length) return text
  return [
    { type: 'text', text },
    ...images.map((image) => ({ type: 'local_image', path: image }))
  ]
}

function parseStructuredOutput(text: string) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {}
    }
    return null
  }
}

function extractRunId(events: any[]) {
  const turn = events.find((event) => event?.turn_id || event?.run_id)
  return turn?.turn_id ? String(turn.turn_id) : turn?.run_id ? String(turn.run_id) : null
}
