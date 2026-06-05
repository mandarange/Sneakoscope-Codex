#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const mod = await importDist('core/codex-control/python-codex-sdk-adapter.js');
const cap = await mod.detectPythonCodexSdkCapability();
assertGate(['codex-app-server', 'openai-codex', 'openai-codex-sdk'].includes(cap.package_name), 'Python Codex SDK package name mismatch');
assertGate(cap.ok === true || cap.blockers.includes('python_codex_sdk_unavailable') || cap.blockers.includes('python_missing') || cap.blockers.includes('python_version_below_3_10'), 'Python SDK unavailable must be a capability blocker');
const requireReal = process.env.SKS_REQUIRE_PYTHON_CODEX_SDK === '1' || process.argv.includes('--require-real');
if (requireReal && !cap.ok) {
  console.log(JSON.stringify({
    schema: 'sks.release-gate.v1',
    ok: false,
    gate: 'python-sdk:real-smoke',
    capability_ok: cap.ok,
    capability_blockers: cap.blockers,
    setup_action: cap.setup_action,
    python_bin: cap.python_bin,
    python_version: cap.python_version,
    blockers: cap.blockers
  }, null, 2));
  process.exit(1);
}
if (requireReal) {
  const plane = await importDist('core/codex-control/codex-control-plane.js');
  const smokeSchema = {
    type: 'object',
    required: ['status', 'summary', 'blockers'],
    properties: {
      status: { type: 'string', enum: ['done'] },
      summary: { type: 'string' },
      blockers: { type: 'array', items: { type: 'string' } }
    },
    additionalProperties: false
  };
  const result = await plane.runCodexTask({
    route: '$Agent',
    missionId: 'M-python-codex-sdk-real-smoke',
    workItemId: 'python-real-smoke',
    slotId: 'slot-python-real',
    generationIndex: 1,
    sessionId: 'python-real-smoke-session',
    cwd: process.cwd(),
    prompt: 'Read-only Python Codex SDK smoke. Do not edit files. Return exactly JSON: {"status":"done","summary":"python-codex-sdk real smoke passed","blockers":[]}',
    inputFiles: [],
    inputImages: [],
    outputSchemaId: 'sks.python-codex-sdk-real-smoke-result.v1',
    outputSchema: smokeSchema,
    sandboxPolicy: 'read-only',
    requestedScopeContract: { id: 'python-real-smoke', read_only: true, allowed_paths: [], write_paths: [] },
    backendPreference: ['python-codex-sdk'],
    mutationLedgerRoot: '.sneakoscope/reports/python-codex-sdk-real-smoke'
  });
  assertGate(result.ok === true, 'real Python Codex SDK smoke failed', result);
  emitGate('python-sdk:real-smoke', {
    status: 'proven',
    capability_ok: cap.ok,
    package_name: cap.package_name,
    import_name: cap.import_name,
    python_bin: cap.python_bin,
    sdk_thread_id: result.sdkThreadId,
    stream_event_count: result.streamEventCount,
    backend: result.backend,
    backend_family: result.backend_family
  });
} else {
  emitGate('python-sdk:capability', {
    capability_ok: cap.ok,
    capability_blockers: cap.blockers,
    package_name: cap.package_name,
    import_name: cap.import_name,
    setup_action: cap.setup_action
  });
}
