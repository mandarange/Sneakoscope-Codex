#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const source = readText('src/core/commands/qa-loop-command.ts');
assertGate(source.includes("backend: mock ? 'fake' : 'codex-sdk'"), 'QA pipeline must default native agents to codex-sdk');
assertGate(source.includes('runNativeAgentOrchestrator'), 'QA pipeline must use native agent orchestrator');
emitGate('codex-sdk:qa-pipeline', { route: '$QA-LOOP' });
