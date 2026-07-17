#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText, releaseGateIds, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const releaseGates = releaseGateIds();
const required = [
  'codex-control:event-stream-ledger',
  'codex-control:all-pipelines'
];
for (const name of required) assertGate(releaseGates.has(name), `required control gate missing from v2 manifest: ${name}`);
const sources = {
  qa: readText('src/core/commands/qa-loop-command.ts'),
  research: readText('src/core/commands/research-command.ts'),
  researchStage: readText('src/core/research/research-stage-runner.ts'),
  naruto: readText('src/core/commands/naruto-command.ts'),
  narutoPreparation: readText('src/core/subagents/official-subagent-preparation.ts'),
  dfix: readText('src/core/commands/dfix-command.ts'),
  workerRouter: readText('src/core/agents/native-worker-backend-router.ts')
};
assertGate(sources.qa.includes("mock ? 'fake' : 'codex-sdk'"), 'QA must route native agents through codex control backend');
assertGate(
  sources.research.includes("backend: mock ? 'mock' : 'codex-sdk'")
    && sources.researchStage.includes('runCodexTask({'),
  'Research must route real stages through the Codex control backend'
);
assertGate(sources.naruto.includes('runOfficialSubagentWorkflow'), 'Naruto must invoke the official Codex subagent runner');
assertGate(sources.narutoPreparation.includes("workflow: 'official_codex_subagent'"), 'Naruto preparation must persist the official subagent workflow contract');
assertGate(!sources.naruto.includes("backend: 'codex-sdk'"), 'Naruto must not fall back to the legacy codex-sdk backend selector');
assertGate(sources.workerRouter.includes('runCodexTask({'), 'native worker router must call runCodexTask');
const fixture = await runFakeCodexSdkTaskFixture('control-all-pipelines');
assertGate(fixture.result.ok === true, 'all pipeline control fixture must pass', fixture.result);
assertGate(fixture.proof.reliability_shield?.ok === true, 'all pipeline fixture must include reliability shield proof', fixture.proof);
emitGate('codex-control:all-pipelines', { gates: required.length, naruto_workflow: 'official_codex_subagent', sdk_thread_id: fixture.result.sdkThreadId });
