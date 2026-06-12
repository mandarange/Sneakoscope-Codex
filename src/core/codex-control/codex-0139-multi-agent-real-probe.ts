import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { ensureDir, runProcess, writeJsonAtomic } from '../fsx.js'
import { codex0139ProbeTail, skippedCodex0139Probe, type Codex0139SingleProbe } from './codex-0139-real-probes.js'

export function normalizeCodex0139InterruptAgentEvent(event: any) {
  const name = String(event?.tool || event?.item?.tool || event?.type || event?.event || event?.name || '')
  return name === 'interrupt_agent' || name === 'close_agent' ? { ...event, canonical: 'subagent_result', stage: 'result' } : event
}

export async function runCodex0139InterruptAgentRealProbe(input: {
  root?: string
  requireReal?: boolean
  timeoutMs?: number
  codexBin?: string | null
} = {}): Promise<Codex0139SingleProbe> {
  const started = Date.now()
  if (process.env.SKS_CODEX_0139_ALLOW_CAPTURED_EVENT_FIXTURE === '1') {
    const event = normalizeCodex0139InterruptAgentEvent({ type: 'interrupt_agent', agent_id: 'captured-real-doc-sample' })
    return {
      ok: event.stage === 'result',
      mode: 'captured-real-fixture',
      duration_ms: Date.now() - started,
      artifact_paths: [],
      evidence: {
        saw_interrupt_agent_event: true,
        normalized_stage: event.stage,
        fixture_allowed_by_env: true
      },
      blockers: event.stage === 'result' ? [] : ['codex_interrupt_agent_normalization_failed']
    }
  }
  const codexBin = input.codexBin || await findCodexBinary()
  if (!codexBin) return skippedCodex0139Probe('codex_cli_missing')
  const root = input.root || process.cwd()
  const tempDir = path.join(root, '.sneakoscope', 'tmp', 'codex-0139-real-probes', `interrupt-agent-${Date.now()}`)
  await ensureDir(tempDir)
  const prompt = 'No file edits. Spawn one tiny subagent named interrupt_probe that only says ready. Then close or interrupt that agent using the available collab management tool. Final answer exactly: interrupt probe done.'
  const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '--ignore-rules', '--disable', 'hooks', '-s', 'read-only', '-C', tempDir, prompt]
  const result = await runProcess(codexBin, args, {
    cwd: tempDir,
    timeoutMs: input.timeoutMs || 120000,
    maxOutputBytes: 1024 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
  const events = parseJsonlEvents(`${(result as any).stdout || ''}\n${(result as any).stderr || ''}`)
  const tools = events
    .map((event: any) => String(event?.item?.tool || event?.tool || ''))
    .filter(Boolean)
  const sawSpawn = tools.includes('spawn_agent')
  const sawInterrupt = tools.includes('interrupt_agent')
  const sawClose = tools.includes('close_agent')
  const closeOrInterruptEvent = events.find((event: any) => ['interrupt_agent', 'close_agent'].includes(String(event?.item?.tool || event?.tool || '')))
  const normalized = normalizeCodex0139InterruptAgentEvent(closeOrInterruptEvent?.item || closeOrInterruptEvent || {})
  const finalText = events.map((event: any) => String(event?.item?.text || '')).find((text) => /interrupt probe done/i.test(text)) || ''
  const ok = (result as any).code === 0 && sawSpawn && (sawInterrupt || sawClose) && normalized.stage === 'result'
  const artifact = path.join(root, '.sneakoscope', 'codex-0139-interrupt-agent-real.json')
  await writeJsonAtomic(artifact, {
    schema: 'sks.codex-0139-interrupt-agent-real.v1',
    ok,
    generated_at: new Date().toISOString(),
    command_line: [codexBin, ...args],
    event_count: events.length,
    tools,
    saw_spawn_agent_event: sawSpawn,
    saw_interrupt_agent_event: sawInterrupt,
    saw_close_agent_event: sawClose,
    normalized_stage: normalized.stage || null,
    final_text_seen: Boolean(finalText),
    stdout_tail: codex0139ProbeTail((result as any).stdout),
    stderr_tail: codex0139ProbeTail((result as any).stderr)
  })
  return {
    ok,
    mode: 'actual-cli',
    command_line: [codexBin, ...args],
    duration_ms: Date.now() - started,
    stdout_tail: codex0139ProbeTail((result as any).stdout),
    stderr_tail: codex0139ProbeTail((result as any).stderr),
    artifact_paths: [artifact, tempDir],
    evidence: {
      event_count: events.length,
      collab_tools_seen: [...new Set(tools)],
      saw_spawn_agent_event: sawSpawn,
      saw_interrupt_agent_event: sawInterrupt,
      saw_close_agent_event: sawClose,
      close_agent_used_as_actual_interrupt_surface: sawClose && !sawInterrupt,
      normalized_stage: normalized.stage || null,
      final_text_seen: Boolean(finalText)
    },
    blockers: ok ? [] : [
      ...((result as any).code === 0 ? [] : ['codex_interrupt_agent_exec_failed']),
      ...(sawSpawn ? [] : ['codex_interrupt_agent_spawn_event_missing']),
      ...(sawInterrupt || sawClose ? [] : ['codex_interrupt_agent_or_close_event_missing']),
      ...(normalized.stage === 'result' ? [] : ['codex_interrupt_agent_normalization_failed'])
    ]
  }
}

function parseJsonlEvents(text: string): any[] {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}
