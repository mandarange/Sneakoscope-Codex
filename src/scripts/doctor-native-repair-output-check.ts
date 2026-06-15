#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const source = readText('src/commands/doctor.ts');
for (const token of ['SKS Native Capabilities:', 'SKS Skills:', 'Secret preservation:', 'secret values: redacted', 'Chrome/web review']) {
  assertGate(source.includes(token), `doctor output missing token: ${token}`);
}
emitGate('doctor:native-repair-output');
