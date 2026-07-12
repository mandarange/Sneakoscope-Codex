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
  team: readText('src/core/commands/team-command.ts'),
  qa: readText('src/core/commands/qa-loop-command.ts'),
  research: readText('src/core/commands/research-command.ts'),
  naruto: readText('src/core/commands/naruto-command.ts'),
  dfix: readText('src/core/commands/dfix-command.ts'),
  workerRouter: readText('src/core/agents/native-worker-backend-router.ts')
};
const teamCreateRedirectsToNaruto = sources.team.includes('redirectTeamCreateToNaruto') && sources.team.includes('narutoCommand');
assertGate(teamCreateRedirectsToNaruto, 'Team create must route through Naruto codex control backend SSOT');
assertGate(sources.qa.includes("mock ? 'fake' : 'codex-sdk'"), 'QA must route native agents through codex control backend');
assertGate(sources.research.includes("mock ? 'fake' : 'codex-sdk'"), 'Research must route native agents through codex control backend');
assertGate(sources.naruto.includes('runOfficialSubagentWorkflow'), 'Naruto must invoke the official Codex subagent runner');
assertGate(sources.naruto.includes("workflow: 'official_codex_subagent'"), 'Naruto must persist the official subagent workflow contract');
assertGate(!sources.naruto.includes("backend: 'codex-sdk'"), 'Naruto must not fall back to the legacy codex-sdk backend selector');
assertGate(sources.workerRouter.includes('runCodexTask({'), 'native worker router must call runCodexTask');
const fixture = await runFakeCodexSdkTaskFixture('control-all-pipelines');
assertGate(fixture.result.ok === true, 'all pipeline control fixture must pass', fixture.result);
assertGate(fixture.proof.reliability_shield?.ok === true, 'all pipeline fixture must include reliability shield proof', fixture.proof);
emitGate('codex-control:all-pipelines', { gates: required.length, naruto_workflow: 'official_codex_subagent', sdk_thread_id: fixture.result.sdkThreadId });
