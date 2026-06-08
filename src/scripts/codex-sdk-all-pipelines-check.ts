#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, packageScripts, readText, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const scripts = packageScripts();
const required = [
  'codex-sdk:dfix-pipeline',
  'codex-sdk:qa-pipeline',
  'codex-sdk:research-pipeline',
  'codex-sdk:team-naruto-agent-pipeline',
  'codex-sdk:release-review-pipeline',
  'codex-sdk:ux-ppt-review-pipeline',
  'codex-sdk:core-skill-pipeline'
];
for (const name of required) assertGate(Boolean(scripts[name]), `required pipeline gate missing: ${name}`);
const sources = {
  team: readText('src/core/commands/team-command.ts'),
  qa: readText('src/core/commands/qa-loop-command.ts'),
  research: readText('src/core/commands/research-command.ts'),
  naruto: readText('src/core/commands/naruto-command.ts'),
  dfix: readText('src/core/commands/dfix-command.ts'),
  coreSkill: readText('src/core/skills/core-skill-types.ts')
};
const teamCreateRedirectsToNaruto = sources.team.includes('redirectTeamCreateToNaruto') && sources.team.includes('narutoCommand');
assertGate(teamCreateRedirectsToNaruto, 'Team create must route through Naruto codex-sdk SSOT');
assertGate(sources.qa.includes("mock ? 'fake' : 'codex-sdk'"), 'QA must route native agents through codex-sdk');
assertGate(sources.research.includes("mock ? 'fake' : 'codex-sdk'"), 'Research must route native agents through codex-sdk');
assertGate(sources.naruto.includes("backend: 'codex-sdk'"), 'Naruto defaults must name codex-sdk');
assertGate(sources.coreSkill.includes("'codex-sdk'"), 'Core skill backend type must include codex-sdk');
const fixture = await runFakeCodexSdkTaskFixture('all-pipelines');
assertGate(fixture.result.ok === true, 'all pipeline SDK fixture must pass', fixture.result);
emitGate('codex-sdk:all-pipelines', { scripts: required.length, sdk_thread_id: fixture.result.sdkThreadId });
