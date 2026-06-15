#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { buildNativeCapabilityRepairMatrix } from '../core/codex-native/native-capability-repair-matrix.js';
import { postcheckNativeCapabilities } from '../core/codex-native/native-capability-postcheck.js';

const root = await makeTempRoot('sks-native-postcheck-');
const matrix = await buildNativeCapabilityRepairMatrix({ root, fixture: 'manual-required', reportPath: null });
const postcheck = await postcheckNativeCapabilities({ root, matrix, fixture: 'manual-required' });
const chrome = postcheck.capabilities.find((state) => state.id === 'chrome_web_review');
assertGate(chrome?.after !== 'verified', 'postcheck must not verify Chrome/web review without extension readiness', postcheck);
assertGate(postcheck.capabilities.every((state) => state.after !== null), 'postcheck must set after state for each capability', postcheck);
emitGate('native-capability:postcheck');
