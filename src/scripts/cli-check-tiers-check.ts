// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const check = readText('src/core/commands/check-command.ts');
const registry = readText('src/cli/command-registry.ts');
for (const token of ['instant', 'affected', 'confidence', 'release', 'real-check']) assertGate(check.includes(token), `check tier missing: ${token}`);
for (const token of ['task:', 'release:', 'triwiki:', 'daemon:']) assertGate(registry.includes(token), `CLI registry missing ${token}`);
emitGate('cli:check-tiers');
