#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const adapter = readText('src/core/codex-control/python-codex-sdk-adapter.ts');
const runner = readText('pytools/codex_sdk_runner.py');
assertGate(adapter.includes("workspace_write"), 'TS -> Python sandbox mapping must include workspace_write');
assertGate(adapter.includes("full_access"), 'TS -> Python sandbox mapping must include full_access');
assertGate(runner.includes('Sandbox.workspace_write'), 'Python runner must use SDK Sandbox presets');
emitGate('python-sdk:sandbox-policy', { sandboxes: ['read_only', 'workspace_write', 'full_access'] });
