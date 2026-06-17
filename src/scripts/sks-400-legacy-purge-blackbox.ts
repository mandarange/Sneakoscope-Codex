// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const registry = readText('src/cli/command-registry.ts');
const migration = readText('docs/sks-4-migration.md');
assertGate(!registry.includes('LEGACY_COMMAND_ALIASES = {\\n  auth'), 'legacy alias block must be destructive-purged');
assertGate(migration.includes('No silent legacy fallback'), 'migration doc must explain no silent fallback');
emitGate('legacy:purge-blackbox');
