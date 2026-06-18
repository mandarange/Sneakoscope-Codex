import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const source = readText('src/core/triwiki/triwiki-proof-bank.ts');
assertGate(source.includes('function pidAlive(pid: number): boolean'), 'proof bank lock must use a pidAlive helper');
assertGate(!source.includes('process.kill(raw.pid, 0) !== undefined'), 'proof bank lock must not compare process.kill(pid, 0) to undefined');
assertGate(source.includes("code === 'EPERM'"), 'proof bank lock must treat EPERM as alive');
emitGate('triwiki:proof-bank-lock-blackbox');
