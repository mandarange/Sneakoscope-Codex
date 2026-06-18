import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const source = readText('src/core/doctor/doctor-dirty-planner.ts');
assertGate(!source.includes('stat.isDirectory() ? `dir:${stat.mtimeMs}`'), 'doctor dirty planner must not hash directory mtimes');
assertGate(!source.includes('mtimeMs, text'), 'doctor dirty planner must not mix file mtime into semantic hashes');
assertGate(source.includes('phaseSemanticState'), 'doctor dirty planner must include phase-specific semantic state');
assertGate(source.includes('clean_proof_missing'), 'doctor dirty planner must reject markers with missing proof evidence');
emitGate('doctor:dirty-semantic-blackbox');
