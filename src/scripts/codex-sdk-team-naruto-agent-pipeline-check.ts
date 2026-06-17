#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const team = readText('src/core/commands/team-command.ts');
const naruto = readText('src/core/commands/naruto-command.ts');
const agent = readText('src/core/agents/agent-command-surface.ts');
assertGate(team.includes('redirectTeamCreateToNaruto') && team.includes('narutoCommand'), 'Team create must redirect to Naruto codex-sdk SSOT');
assertGate(naruto.includes("backend: 'codex-sdk'"), 'Naruto help/defaults must expose codex-sdk');
assertGate(agent.includes("useLocalModel && !noOllama") && agent.includes("'local-llm'") && agent.includes("useOllamaProtocol && !noOllama"), 'Agent command surface must route --local-model to local-llm and --ollama to ollama explicitly');
assertGate(agent.includes('backendExplicit'), 'Agent command surface must preserve explicit backend/local-model intent');
emitGate('codex-sdk:team-naruto-agent-pipeline', { routes: ['$Team', '$Naruto', '$Agent'] });
