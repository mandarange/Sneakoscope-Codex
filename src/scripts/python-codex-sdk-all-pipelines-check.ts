#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';
import { importDist, root } from './lib/codex-sdk-gate-lib.js';

const plane = readText('src/core/codex-control/codex-control-plane.ts');
const adapter = readText('src/core/codex-control/python-codex-sdk-adapter.ts');
assertGate(plane.includes("'python-codex-sdk'"), 'Codex Control backend union must include python-codex-sdk');
assertGate(adapter.includes('runPythonCodexSdkTask'), 'Python SDK adapter must expose a task runner');
const mod = await importDist('core/codex-control/codex-control-plane.js');
const schema = await importDist('core/codex-control/schemas/agent-worker-result.schema.js');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-python-codex-sdk-pipeline-'));
const oldFake = process.env.SKS_PYTHON_CODEX_SDK_FAKE;
process.env.SKS_PYTHON_CODEX_SDK_FAKE = '1';
try {
  const result = await mod.runCodexTask({
    route: '$Agent',
    missionId: 'M-python-sdk-all-pipelines',
    workItemId: 'python-sdk-fixture',
    slotId: 'slot-python-fixture',
    generationIndex: 1,
    sessionId: 'python-sdk-fixture-session',
    cwd: root,
    prompt: 'Hermetic Python Codex SDK backend fixture.',
    inputFiles: [],
    inputImages: [],
    outputSchemaId: schema.CODEX_AGENT_WORKER_RESULT_SCHEMA_ID,
    outputSchema: schema.codexAgentWorkerResultSchema,
    sandboxPolicy: 'read-only',
    requestedScopeContract: { id: 'python-sdk-fixture', read_only: true, allowed_paths: [], write_paths: [] },
    backendPreference: ['python-codex-sdk'],
    mutationLedgerRoot: tmp
  });
  assertGate(result.ok === true, 'Python SDK backend fixture must pass', result);
  assertGate(result.backend === 'python-codex-sdk', 'Python SDK backend fixture must select python-codex-sdk', result);
  assertGate(result.pythonSdkProofPath && result.streamEventCount > 0, 'Python SDK backend fixture must write proof and events', result);
  emitGate('python-sdk:all-pipelines', { backend: result.backend, backend_family: result.backend_family, stream_event_count: result.streamEventCount });
} finally {
  if (oldFake === undefined) delete process.env.SKS_PYTHON_CODEX_SDK_FAKE;
  else process.env.SKS_PYTHON_CODEX_SDK_FAKE = oldFake;
}
