#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/agent-runner-codex-exec.js');
const agent = { id: 'agent-profile-fixture', session_id: 'session-01', persona_id: 'verifier' };
const withProfile = mod.buildCodexExecAgentArgs(agent, 'fixture prompt', { profile: 'sks-mad-high', resultFile: 'result.json' }).args;
const withoutProfile = mod.buildCodexExecAgentArgs(agent, 'fixture prompt', { resultFile: 'result.json' }).args;

assertGate(withProfile.includes('--profile'), 'codex exec agent args must include --profile when requested', { withProfile });
assertGate(withProfile.includes('sks-mad-high'), 'codex exec agent args must include requested profile value', { withProfile });
assertGate(!withProfile.includes('--ignore-user-config'), 'profile runs must not ignore user config because profile v2 lives in user config', { withProfile });
assertGate(withoutProfile.includes('--ignore-user-config'), 'non-profile dry fixture should keep hermetic ignore-user-config behavior', { withoutProfile });
emitGate('codex:profile-primary', { profile_arg_index: withProfile.indexOf('--profile') });
