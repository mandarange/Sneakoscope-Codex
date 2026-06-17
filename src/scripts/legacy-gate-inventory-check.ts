// @ts-nocheck
import { assertGate, emitGate, readJson, readText } from './sks-1-18-gate-lib.js';

const gates = readJson('release-gates.v2.json').gates || [];
const migration = readText('docs/sks-4-migration.md');
const legacy = gates.filter((gate) => /tmux|legacy|0\.13[0-9]/.test(`${gate.id} ${gate.command}`));
assertGate(migration.includes('Removed runtime migration') && migration.includes('No silent legacy fallback'), 'migration doc must record legacy purge policy');
emitGate('legacy:gate-inventory', { legacy_candidates: legacy.length });
