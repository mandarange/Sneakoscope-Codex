#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';

const root = await makeTempRoot('sks-native-chrome-');
delete process.env.SKS_CHROME_EXTENSION_READY;
const report = await repairNativeCapabilities({ root, fix: true, yes: true, capabilities: ['chrome_web_review'], fixture: 'manual-required' });
const state = report.capabilities[0];
assertGate(state?.repairability === 'manual-required' && state.after !== 'verified', 'Chrome/web review must not verify without extension readiness', report);
assertGate(report.ok === true && report.blockers.length === 0 && Array.isArray(report.route_blockers['route-chrome-web-review']), 'Chrome/web review must not block core readiness', report);
emitGate('native:chrome-web-review-repair');
