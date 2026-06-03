#!/usr/bin/env node
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.mjs';

const dfix = readText('src/core/commands/dfix-command.ts');
const patchSwarm = readText('scripts/dfix-patch-swarm-route-blackbox.mjs');
assertGate(dfix.includes('DFIX') || dfix.includes('dfix'), 'DFix command source missing');
assertGate(patchSwarm.includes('dfix'), 'DFix patch swarm blackbox must exist');
emitGate('codex-sdk:dfix-pipeline', { source: 'dfix-command.ts' });
