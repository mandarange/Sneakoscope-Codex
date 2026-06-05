#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const proof = readText('src/core/codex-control/codex-control-proof.ts');
const sandbox = readText('src/core/codex-control/codex-sdk-sandbox-policy.ts');
assertGate(proof.includes('sandbox:'), 'Codex control proof must include sandbox scope');
assertGate(proof.includes('env:'), 'Codex control proof must include environment proof');
assertGate(sandbox.includes('mad_sks_authorized') || sandbox.includes('user_confirmed_full_access'), 'Sandbox policy must include scoped authorization signals');
emitGate('codex:environment-scoped-approvals', { proof: ['sandbox', 'env', 'scoped_authorization'] });
