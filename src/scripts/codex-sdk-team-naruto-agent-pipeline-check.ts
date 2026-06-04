#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const team = readText('src/core/commands/team-command.ts');
const naruto = readText('src/core/commands/naruto-command.ts');
const agent = readText('src/core/agents/agent-command-surface.ts');
assertGate(team.includes("backend: mock ? 'fake' : 'codex-sdk'"), 'Team must default to codex-sdk');
assertGate(naruto.includes("backend: 'codex-sdk'"), 'Naruto help/defaults must expose codex-sdk');
assertGate(agent.includes("useOllama && !noOllama ? 'ollama' : 'codex-sdk'"), 'Agent command surface must default to codex-sdk unless local model is explicit');
assertGate(agent.includes('backendExplicit'), 'Agent command surface must preserve explicit backend/local-model intent');
emitGate('codex-sdk:team-naruto-agent-pipeline', { routes: ['$Team', '$Naruto', '$Agent'] });
