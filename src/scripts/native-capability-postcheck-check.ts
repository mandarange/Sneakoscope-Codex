#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { buildNativeCapabilityRepairMatrix } from '../core/codex-native/native-capability-repair-matrix.js';
import { postcheckNativeCapabilities } from '../core/codex-native/native-capability-postcheck.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';

const root = await makeTempRoot('sks-native-postcheck-');
const matrix = await buildNativeCapabilityRepairMatrix({ root, fixture: 'manual-required', reportPath: null });
const postcheck = await postcheckNativeCapabilities({ root, matrix, fixture: 'manual-required' });
const chrome = postcheck.capabilities.find((state) => state.id === 'chrome_web_review');
const repairedManual = await repairNativeCapabilities({ root, fix: true, yes: true, fixture: 'manual-required' });
const imagePath = repairedManual.capabilities.find((state) => state.id === 'image_path_exposure');
assertGate(chrome?.after !== 'verified', 'postcheck must not verify Chrome/web review without extension readiness', postcheck);
assertGate(imagePath?.after === 'degraded', 'saved artifact path fallback must be degraded, not verified native image path exposure', repairedManual);
assertGate(postcheck.capabilities.every((state) => state.after !== null), 'postcheck must set after state for each capability', postcheck);
emitGate('native-capability:postcheck');
