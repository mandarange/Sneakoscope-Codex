#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';

const root = await makeTempRoot('sks-native-computer-');
delete process.env.SKS_COMPUTER_USE_CAPABILITY;
const report = await repairNativeCapabilities({ root, fix: true, yes: true, capabilities: ['computer_use'], fixture: 'manual-required' });
const state = report.capabilities[0];
assertGate(state?.repairability === 'manual-required' && state.after !== 'verified', 'computer use must stay manual-required when OS permission/capability is unknown', report);
emitGate('native:computer-use-repair');
