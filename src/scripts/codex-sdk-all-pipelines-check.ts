#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText, releaseGateIds, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const releaseGates = releaseGateIds();
const required = [
  'codex-sdk:all-pipelines'
];
for (const name of required) assertGate(releaseGates.has(name), `required pipeline gate missing from v2 manifest: ${name}`);
const sources = {
  qa: readText('src/core/commands/qa-loop-command.ts'),
  research: readText('src/core/commands/research-command.ts'),
  naruto: readText('src/core/commands/naruto-command.ts'),
  narutoPreparation: readText('src/core/subagents/official-subagent-preparation.ts'),
  dfix: readText('src/core/commands/dfix-command.ts'),
  coreSkill: readText('src/core/skills/core-skill-types.ts')
};
assertGate(sources.qa.includes("mock ? 'fake' : 'codex-sdk'"), 'QA must route native agents through codex-sdk');
assertGate(
  sources.research.includes("backend: mock ? 'mock' : 'codex-sdk'")
    && sources.research.includes("reviewer_workflow: 'official_codex_subagent'"),
  'Research must use the Codex SDK stage backend plus the official subagent reviewer workflow'
);
assertGate(sources.naruto.includes('runOfficialSubagentWorkflow'), 'Naruto must invoke the official Codex subagent runner');
assertGate(sources.narutoPreparation.includes("workflow: 'official_codex_subagent'"), 'Naruto preparation must persist the official subagent workflow contract');
assertGate(!sources.naruto.includes("backend: 'codex-sdk'"), 'Naruto must not select the legacy codex-sdk backend');
assertGate(sources.coreSkill.includes("'codex-sdk'"), 'Core skill backend type must include codex-sdk');
const fixture = await runFakeCodexSdkTaskFixture('all-pipelines');
assertGate(fixture.result.ok === true, 'all pipeline SDK fixture must pass', fixture.result);
emitGate('codex-sdk:all-pipelines', { gates: required.length, naruto_workflow: 'official_codex_subagent', sdk_thread_id: fixture.result.sdkThreadId });
