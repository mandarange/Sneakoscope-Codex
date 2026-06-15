#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';

const repairableRoot = await makeTempRoot('sks-doctor-native-repairable-');
process.env.SKS_CHROME_EXTENSION_READY = '1';
process.env.SKS_COMPUTER_USE_CAPABILITY = 'verified';
const repairable = await repairNativeCapabilities({ root: repairableRoot, fix: true, yes: true, fixture: 'all-repairable' });
delete process.env.SKS_CHROME_EXTENSION_READY;
delete process.env.SKS_COMPUTER_USE_CAPABILITY;
const manualRoot = await makeTempRoot('sks-doctor-native-manual-');
const manual = await repairNativeCapabilities({ root: manualRoot, fix: true, yes: true, fixture: 'manual-required' });
assertGate(repairable.ok === true, 'repairable fixture must verify after doctor native repair', repairable);
assertGate(manual.capabilities.some((state) => state.repairability === 'manual-required' && state.after !== 'verified'), 'manual-only fixture must not fake verified success', manual);
emitGate('doctor:native-capability-repair-blackbox');
