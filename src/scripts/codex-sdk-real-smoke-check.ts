#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const requireReal = process.env.SKS_CODEX_SDK_REQUIRE_REAL === '1'
  || process.env.SKS_REQUIRE_CODEX_SDK === '1'
  || process.argv.includes('--require-real');
if (!requireReal) {
  const fixture = await runFakeCodexSdkTaskFixture('real-smoke-fixture');
  assertGate(fixture.result.ok === true, 'fixture SDK smoke must pass', fixture.result);
  emitGate('codex-sdk:real-smoke', { status: 'integration_optional', fixture_thread_id: fixture.result.sdkThreadId });
} else {
  const mod = await importDist('core/codex-control/codex-control-plane.js');
  const schema = await importDist('core/codex-control/schemas/agent-worker-result.schema.js');
  const result = await mod.runCodexTask({
    route: '$Agent',
    missionId: 'M-codex-sdk-real-smoke',
    workItemId: 'real-smoke',
    slotId: 'slot-real',
    generationIndex: 1,
    sessionId: 'real-smoke-session',
    cwd: process.cwd(),
    prompt: [
      'Read-only real Codex SDK smoke. Do not edit files.',
      'Return only JSON matching sks.agent-worker-result.v1.',
      'Use status "done", a short summary, findings as string array, changed_files as [], patch_envelopes as [], verification as { "status": "passed", "checks": ["real-codex-sdk-smoke"] }, rollback_notes as [], and blockers as [].'
    ].join('\n'),
    inputFiles: [],
    inputImages: [],
    outputSchemaId: schema.CODEX_AGENT_WORKER_RESULT_SCHEMA_ID,
    outputSchema: schema.codexAgentWorkerResultSchema,
    sandboxPolicy: 'read-only',
    requestedScopeContract: { id: 'real-smoke', read_only: true, allowed_paths: [], write_paths: [] },
    mutationLedgerRoot: '.sneakoscope/reports/codex-sdk-real-smoke'
  });
  assertGate(result.ok === true, 'real Codex SDK smoke failed', result);
  emitGate('codex-sdk:real-smoke', { status: 'proven', sdk_thread_id: result.sdkThreadId, stream_event_count: result.streamEventCount });
}
