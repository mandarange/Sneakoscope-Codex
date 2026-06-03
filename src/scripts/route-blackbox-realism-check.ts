#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';
import path from 'node:path';

const lib = fs.readFileSync(path.join(root, 'src', 'scripts', 'agent-route-blackbox-lib.ts'), 'utf8');
const proof = fs.readFileSync(path.join(root, 'src', 'core', 'agents', 'agent-proof-evidence.ts'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const token of ['runActualAgentBackfillBlackbox', 'runActualTeamBackfillBlackbox', 'runActualResearchBackfillBlackbox', 'runActualQaBackfillBlackbox']) {
  assertGate(lib.includes(token), `route blackbox helper missing ${token}`);
}
for (const token of ['actual_agent_command', 'actual_team_command', 'actual_research_command', 'actual_qa_command']) {
  assertGate(lib.includes(token), `route blackbox helper missing exact kind ${token}`);
}
assertGate(proof.includes('non_agent_route_used_generic_agent_run_route_standin'), 'proof must block non-agent route stand-ins');
assertGate(proof.includes('real_route_command_used'), 'proof must record real_route_command_used');
assertGate(Boolean(packageJson.scripts['dfix:fixture']), 'DFix route fixture gate must exist');
assertGate(Boolean(packageJson.scripts['ppt:full-e2e-blackbox']), 'PPT route blackbox gate must exist');
assertGate(Boolean(packageJson.scripts['ux-review:imagegen-blackbox']), 'UX route blackbox gate must exist');
emitGate('route:blackbox-realism', { actual_route_helpers: 4, standin_blocker: true });
