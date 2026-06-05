#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const router = readText('src/core/agents/native-worker-backend-router.ts');
const control = readText('src/core/codex-control/codex-task-runner.ts');
const policy = readText('src/core/local-llm/local-worker-eligibility.ts');
assertGate(router.includes("backend === 'local-llm'"), 'native worker router must support local-llm backend');
assertGate(control.includes('runLocalLlmTask'), 'Codex Control Plane must call local LLM task adapter');
assertGate(policy.includes('requires_gpt_final'), 'local worker eligibility must require GPT final');
emitGate('local-llm:all-pipelines', { local_backend: 'local-llm', requires_gpt_final: true });
