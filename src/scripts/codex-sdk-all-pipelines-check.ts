#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText, releaseGateIds, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const releaseGates = releaseGateIds();
const required = [
  'codex-sdk:all-pipelines'
];
for (const name of required) assertGate(releaseGates.has(name), `required pipeline gate missing from v2 manifest: ${name}`);
const sources = {
  team: readText('src/core/commands/team-command.ts'),
  qa: readText('src/core/commands/qa-loop-command.ts'),
  research: readText('src/core/commands/research-command.ts'),
  naruto: readText('src/core/commands/naruto-command.ts'),
  dfix: readText('src/core/commands/dfix-command.ts'),
  coreSkill: readText('src/core/skills/core-skill-types.ts')
};
const teamCreateRedirectsToNaruto = sources.team.includes('redirectTeamCreateToNaruto') && sources.team.includes('narutoCommand');
assertGate(teamCreateRedirectsToNaruto, 'Team create must route through the Naruto official-subagent SSOT');
assertGate(sources.qa.includes("mock ? 'fake' : 'codex-sdk'"), 'QA must route native agents through codex-sdk');
assertGate(sources.research.includes("mock ? 'fake' : 'codex-sdk'"), 'Research must route native agents through codex-sdk');
assertGate(sources.naruto.includes('runOfficialSubagentWorkflow'), 'Naruto must invoke the official Codex subagent runner');
assertGate(sources.naruto.includes("workflow: 'official_codex_subagent'"), 'Naruto must persist the official subagent workflow contract');
assertGate(!sources.naruto.includes("backend: 'codex-sdk'"), 'Naruto must not select the legacy codex-sdk backend');
assertGate(sources.coreSkill.includes("'codex-sdk'"), 'Core skill backend type must include codex-sdk');
const fixture = await runFakeCodexSdkTaskFixture('all-pipelines');
assertGate(fixture.result.ok === true, 'all pipeline SDK fixture must pass', fixture.result);
emitGate('codex-sdk:all-pipelines', { gates: required.length, naruto_workflow: 'official_codex_subagent', sdk_thread_id: fixture.result.sdkThreadId });
