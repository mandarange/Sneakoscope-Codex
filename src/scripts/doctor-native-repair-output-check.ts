#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const source = readText('src/commands/doctor.ts');
const matrixSource = readText('src/core/codex-native/native-capability-repair-matrix.ts');
for (const token of ['SKS Native Capabilities:', 'SKS Skills:', 'Secret preservation:', 'raw secret values: never recorded', 'Chrome/web review', 'manual next actions:', 'uniqueNativeManualActions']) {
  assertGate(source.includes(token), `doctor output missing token: ${token}`);
}
for (const token of [
  "id === 'image_path_exposure'",
  "return 'fallback'",
  "id === 'app_handoff'",
  "return 'unavailable'"
]) {
  assertGate(source.includes(token), `doctor native status mapping missing token: ${token}`);
}
assertGate(matrixSource.includes('Install/enable the official Codex Chrome Extension') && matrixSource.includes('Enable Codex Computer Use and macOS Screen Recording/Accessibility permissions'), 'doctor output must retain exact manual actions for native capabilities');
emitGate('doctor:native-repair-output');
