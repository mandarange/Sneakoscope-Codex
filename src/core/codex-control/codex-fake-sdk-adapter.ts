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
  const events = [
    { type: 'thread.started', thread_id: threadId },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'item_fake_1', type: 'agent_message', text: JSON.stringify(fakeStructuredOutput(input)) } },
    { type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 } }
  ]
  return {
    ok: true,
    sdkThreadId: threadId,
    sdkRunId: runId,
    events,
    finalResponse: JSON.stringify(fakeStructuredOutput(input)),
    structuredOutput: fakeStructuredOutput(input),
    blockers: [],
    raw: { fake: true, generated_at: nowIso() }
  }
}

function fakeStructuredOutput(input: CodexTaskInput) {
  if (input.outputSchemaId === GPT_FINAL_ARBITER_RESULT_SCHEMA_ID) {
    const unsafe = /\b(truncate|delete all|drop table|credential)\b/i.test(input.prompt || '')
    return {
      schema: GPT_FINAL_ARBITER_RESULT_SCHEMA_ID,
      status: unsafe ? 'rejected' : 'approved',
      summary: unsafe
        ? 'Fake Codex SDK GPT final arbiter rejected an unsafe candidate for hermetic verification.'
        : 'Fake Codex SDK GPT final arbiter approved the candidate for hermetic verification.',
      gpt_review_findings: unsafe ? [{ severity: 'high', message: 'unsafe candidate rejected' }] : [],
      accepted_patch_envelopes: unsafe ? [] : [],
      modified_patch_envelopes: [],
      rejected_patch_envelopes: unsafe ? [{ reason: 'unsafe candidate' }] : [],
      required_followup_work: unsafe ? [{ blocker: 'unsafe_candidate_patch' }] : [],
      verification_plan: ['schema validation', 'local collaboration final gate'],
      rollback_notes: [],
      blockers: unsafe ? ['unsafe_candidate_patch'] : [],
      confidence: unsafe ? 'medium' : 'high'
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
