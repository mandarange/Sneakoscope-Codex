#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const basicCli = readText('src/core/commands/basic-cli.ts');
const doctor = readText('src/commands/doctor.ts');
assertGate(basicCli.includes("withSecretPreservationGuard(root, 'setup-command'"), 'setup command must use secret preservation guard');
assertGate(basicCli.includes("withSecretPreservationGuard(root, 'update-now'"), 'update now command must use secret preservation guard');
assertGate(basicCli.includes("withSecretPreservationGuard(root, 'update-rollback'"), 'update rollback command must use secret preservation guard');
assertGate(doctor.includes("withSecretPreservationGuard(root, 'doctor-fix'"), 'doctor --fix setup/config mutation block must start inside doctor-level secret guard');
assertGate(doctor.includes('runDoctorNativeCapabilityRepair'), 'doctor must call native repair facade that includes secret guard');
emitGate('update:secret-preservation-guard');
