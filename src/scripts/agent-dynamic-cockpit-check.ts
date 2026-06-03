#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const orchestrator = await importDist('core/agents/agent-orchestrator.js');
const run = await orchestrator.runNativeAgentOrchestrator({ prompt: 'dynamic cockpit fixture', agents: 2, concurrency: 2, mock: true, backend: 'fake' });
assertGate(run.ok === true, 'fake orchestrator run must pass', run.proof);
assertGate(run.proof.target_active_slots === 2, 'proof must expose target active slots', run.proof);
assertGate(run.proof.session_generation_count === 2, 'proof must expose session generation count', run.proof);
emitGate('agent:dynamic-cockpit', { target_active_slots: run.proof.target_active_slots, session_generation_count: run.proof.session_generation_count });
