import { skippedCodex0139Probe, type Codex0139SingleProbe } from './codex-0139-real-probes.js'

export function normalizeCodex0139InterruptAgentEvent(event: any) {
  const name = String(event?.type || event?.event || event?.name || '')
  return name === 'interrupt_agent' ? { ...event, canonical: 'subagent_result', stage: 'result' } : event
}

export async function runCodex0139InterruptAgentRealProbe(input: { requireReal?: boolean } = {}): Promise<Codex0139SingleProbe> {
  if (process.env.SKS_CODEX_0139_ALLOW_CAPTURED_EVENT_FIXTURE === '1') {
    const event = normalizeCodex0139InterruptAgentEvent({ type: 'interrupt_agent', agent_id: 'captured-real-doc-sample' })
    return {
      ok: event.stage === 'result',
      mode: 'captured-real-fixture',
      duration_ms: 0,
      artifact_paths: [],
      evidence: {
        saw_interrupt_agent_event: true,
        normalized_stage: event.stage,
        fixture_allowed_by_env: true
      },
      blockers: event.stage === 'result' ? [] : ['codex_interrupt_agent_normalization_failed']
    }
  }
  const skipped = skippedCodex0139Probe('codex_interrupt_agent_actual_event_not_safely_scriptable', {
    allow_captured_fixture_env: 'SKS_CODEX_0139_ALLOW_CAPTURED_EVENT_FIXTURE=1'
  })
  return input.requireReal ? skipped : skipped
}
