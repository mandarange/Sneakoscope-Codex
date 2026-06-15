#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { runDoctorNativeCapabilityRepair } from '../core/doctor/doctor-native-capability-repair.js';

const root = await makeTempRoot('sks-doctor-native-');
process.env.CODEX_HOME = `${root}/codex-home`;
const report = await runDoctorNativeCapabilityRepair({ root, fix: false, yes: true, flags: [] });
assertGate(report.schema === 'sks.doctor-native-capability-repair.v1', 'doctor native repair report schema mismatch', report);
assertGate(Boolean(report.core_skills) && Boolean(report.skill_dedupe) && Boolean(report.native_capabilities), 'doctor native repair must call core skills, dedupe, and native capability matrix', report);
emitGate('doctor:native-capability-repair');
