import { nowIso, randomId } from '../fsx.js'
import type { CodexTaskInput } from './codex-control-plane.js'
import { GPT_FINAL_ARBITER_RESULT_SCHEMA_ID } from './gpt-final-review-schema.js'

export function fakeCodexSdkAllowed() {
  return process.env.NODE_ENV === 'test'
    || process.env.SKS_CODEX_SDK_FAKE === '1'
    || process.env.SKS_CODEX_SDK_FIXTURE === '1'
}

export async function runFakeCodexSdkTask(input: CodexTaskInput) {
  const threadId = `sdk_fake_thread_${randomId(10)}`
  const runId = `sdk_fake_run_${randomId(10)}`
  const sessionId = input.sessionId || `sks-${randomId(12)}`
  const events = [
    { type: 'thread.started', thread_id: threadId, session_id: sessionId },
    { type: 'turn.started', session_id: sessionId },
    { type: 'item.completed', session_id: sessionId, item: { id: 'item_fake_1', type: 'agent_message', text: JSON.stringify(fakeStructuredOutput(input)) } },
    { type: 'turn.completed', session_id: sessionId, usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 } }
  ]
  return {
    ok: true,
    sdkThreadId: threadId,
    sdkRunId: runId,
    sessionId,
    events,
    finalResponse: JSON.stringify(fakeStructuredOutput(input)),
    structuredOutput: fakeStructuredOutput(input),
    blockers: [],
    raw: { fake: true, generated_at: nowIso() }
  }
}

function fakeStructuredOutput(input: CodexTaskInput) {
  if (input.outputSchemaId === GPT_FINAL_ARBITER_RESULT_SCHEMA_ID) {
    const prompt = String(input.prompt || '')
    const leanEnabled = /\b(Lean review|Lean Engineering Policy|sks\.lean-engineering-policy)\b/i.test(prompt)
    const unsafe = /\b(truncate|delete all|drop table|credential|delete validation|validation removed|path traversal|sql injection|secret leak)\b/i.test(prompt)
    const overbuild = leanEnabled ? classifyLeanOverbuild(prompt) : null
    const status = unsafe ? 'rejected' : overbuild ? 'needs_more_work' : 'approved'
    const leanStatus = unsafe ? 'rejected' : overbuild ? 'needs_more_work' : 'pass'
    const blockers = unsafe ? ['unsafe_candidate_patch'] : overbuild?.blockers || []
    const findings = unsafe
      ? [{ id: 'unsafe-candidate', severity: 'high', summary: 'unsafe candidate rejected' }]
      : overbuild ? overbuild.findings : []
    return {
      schema: GPT_FINAL_ARBITER_RESULT_SCHEMA_ID,
      status,
      summary: unsafe
        ? 'Fake Codex SDK GPT final arbiter rejected an unsafe candidate for hermetic verification.'
        : overbuild
          ? 'Fake Codex SDK GPT final arbiter requested a leaner candidate for hermetic verification.'
          : 'Fake Codex SDK GPT final arbiter approved the candidate for hermetic verification.',
      gpt_review_findings: findings,
      accepted_patch_envelopes: status === 'approved' ? [] : [],
      modified_patch_envelopes: [],
      rejected_patch_envelopes: status === 'rejected' ? [{ id: blockers[0] || 'rejected-candidate', summary: blockers[0] || 'rejected candidate', patch_envelope_json: '{}' }] : [],
      required_followup_work: blockers.map((blocker) => ({ id: blocker, severity: unsafe ? 'high' : 'medium', summary: blocker })),
      verification_plan: ['schema validation', 'local collaboration final gate'],
      rollback_notes: [],
      blockers,
      lean_review: {
        status: leanStatus,
        selected_rung: unsafe ? 'unknown' : overbuild?.selected_rung || 'minimal-custom',
        unnecessary_files: [],
        unnecessary_dependencies: overbuild?.unnecessary_dependencies || [],
        unnecessary_abstractions: overbuild?.unnecessary_abstractions || [],
        fallback_findings: unsafe ? ['unsafe_candidate_patch'] : overbuild?.fallback_findings || [],
        root_cause_review: overbuild?.root_cause_review || [],
        verification_minimum_present: !unsafe && !/\b(missing runnable check|no runnable check)\b/i.test(prompt),
        net_lines: null
      },
      confidence: unsafe || overbuild ? 'medium' : 'high'
    }
  }
  return {
    status: 'done',
    summary: `Fake Codex SDK task completed for ${input.workItemId || input.route}.`,
    findings: ['codex-sdk fake adapter emitted structured output for hermetic verification'],
    changed_files: [],
    patch_envelopes: [],
    verification: { status: 'passed', checks: ['codex-sdk-fake-adapter', input.outputSchemaId] },
    rollback_notes: [],
    blockers: []
  }
}

function classifyLeanOverbuild(prompt: string): null | {
  selected_rung: string
  blockers: string[]
  findings: Array<{ id: string; severity: string; summary: string }>
  unnecessary_dependencies?: string[]
  unnecessary_abstractions?: string[]
  fallback_findings?: string[]
  root_cause_review?: string[]
} {
  if (/\b(existing helper reimplementation|same helper reimplementation|reimplement existing helper)\b/i.test(prompt)) {
    return leanFinding('reuse_existing_helper', 'reuse-existing', 'Candidate reimplements an existing helper instead of reusing the repository authority.', {
      root_cause_review: ['reuse existing helper or fix the common helper once']
    })
  }
  if (/\b(new dependency|dependency bloat|native platform instead of dependency)\b/i.test(prompt)) {
    return leanFinding('unnecessary_dependency', 'stdlib', 'Candidate adds a dependency where stdlib or platform support is sufficient.', {
      unnecessary_dependencies: ['unjustified dependency']
    })
  }
  if (/\b(one implementation factory|single implementation factory|one implementation interface)\b/i.test(prompt)) {
    return leanFinding('single_impl_abstraction', 'minimal-custom', 'Candidate adds an abstraction without a second implementation or real variation axis.', {
      unnecessary_abstractions: ['single implementation factory/interface']
    })
  }
  if (/\b(hidden mock fallback|silent mock fallback|fixture fallback)\b/i.test(prompt)) {
    return leanFinding('hidden_fallback', 'minimal-custom', 'Candidate hides a production failure behind a mock or fixture fallback.', {
      fallback_findings: ['hidden mock fallback']
    })
  }
  if (/\b(caller duplicate guard|duplicate caller guard|symptom patch)\b/i.test(prompt)) {
    return leanFinding('root_cause_missing', 'minimal-custom', 'Candidate patches a caller symptom instead of the shared root cause.', {
      root_cause_review: ['move duplicated guard to the shared root-cause helper']
    })
  }
  return null
}

function leanFinding(
  id: string,
  selectedRung: string,
  summary: string,
  extra: {
    unnecessary_dependencies?: string[]
    unnecessary_abstractions?: string[]
    fallback_findings?: string[]
    root_cause_review?: string[]
  } = {}
) {
  return {
    selected_rung: selectedRung,
    blockers: [id],
    findings: [{ id, severity: 'medium', summary }],
    ...extra
  }
}
