#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const runner = readText('src/core/codex-control/codex-task-runner.ts');
const registry = readText('src/core/codex-control/codex-thread-registry.ts');
assertGate(runner.includes('backendPreference'), 'Codex task runner must carry backend/runtime preference');
assertGate(runner.includes('backend_family'), 'Codex task runner must persist backend family');
assertGate(registry.includes('recordCodexThread'), 'Codex thread registry missing');
emitGate('codex:thread-runtime-choice', { runtime_choice: 'backendPreference/backend_family' });
