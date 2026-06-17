// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const registry = readText('src/cli/command-registry.ts');
assertGate(!registry.includes("auth: '") && !registry.includes("dollars: '"), 'legacy compatibility aliases must be purged from command registry');
assertGate(registry.includes('tmux') && registry.includes('removed-runtime migration notice'), 'tmux command must be explicit removed-runtime notice only');
emitGate('legacy:gate-purge');
