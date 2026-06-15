#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { buildNativeCapabilityRepairMatrix, NATIVE_CAPABILITY_IDS } from '../core/codex-native/native-capability-repair-matrix.js';

const root = await makeTempRoot('sks-native-matrix-');
const matrix = await buildNativeCapabilityRepairMatrix({ root, fixture: 'manual-required' });
assertGate(matrix.schema === 'sks.native-capability-repair-matrix.v1', 'native repair matrix schema mismatch', matrix);
assertGate(matrix.capabilities.length === NATIVE_CAPABILITY_IDS.length, 'native repair matrix must cover every capability', matrix);
assertGate(matrix.capabilities.some((state) => state.id === 'chrome_web_review' && state.repairability === 'manual-required'), 'Chrome extension readiness must be manual-required when missing', matrix);
emitGate('native-capability:repair-matrix', { capabilities: matrix.capabilities.length });
