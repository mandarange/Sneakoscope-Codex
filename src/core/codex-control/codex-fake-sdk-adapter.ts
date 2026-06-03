import { nowIso, randomId } from '../fsx.js'
import type { CodexTaskInput } from './codex-control-plane.js'

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
