#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, packageScripts, readText, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const scripts = packageScripts();
const required = [
  'codex-control:capability',
  'codex-control:no-legacy-fallback',
  'codex-control:structured-output',
  'codex-control:event-stream-ledger',
  'codex-control:thread-registry',
  'codex-control:side-effect-scope',
  'codex-control:empty-result-retry',
  'codex-control:stream-idle-watchdog',
  'codex-control:tool-call-sequence-repair',
  'codex-control:keepalive-no-cot-leak'
];
for (const name of required) assertGate(Boolean(scripts[name]), `required control gate missing: ${name}`);
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
assertGate(sources.naruto.includes("backend: 'codex-sdk'"), 'Naruto defaults must name codex-sdk control backend');
assertGate(sources.workerRouter.includes('runCodexTask({'), 'native worker router must call runCodexTask');
const fixture = await runFakeCodexSdkTaskFixture('control-all-pipelines');
assertGate(fixture.result.ok === true, 'all pipeline control fixture must pass', fixture.result);
assertGate(fixture.proof.reliability_shield?.ok === true, 'all pipeline fixture must include reliability shield proof', fixture.proof);
emitGate('codex-control:all-pipelines', { scripts: required.length, sdk_thread_id: fixture.result.sdkThreadId });
