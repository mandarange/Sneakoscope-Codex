#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText, scriptContains } from './sks-1-18-gate-lib.js';

const router = readText('src/cli/router.ts');
const helper = readText('src/core/update/update-migration-state.ts');

assertGate(router.includes('ensureCurrentMigrationBeforeCommand'), 'router must call first-command migration gate before lazy command dispatch');
assertGate(helper.includes('INSTALLATION_EPOCH_SCHEMA') && helper.includes('installationEpochPath'), 'migration helper must keep a persistent installation epoch');
assertGate(helper.includes('projectUpdateMigrationReceiptPath'), 'migration helper must keep a project receipt');
assertGate(helper.includes("'--profile', 'migration'") && helper.includes("'--machine-only'") && helper.includes("'--report-file'"), 'first normal command must repair through package-local migration Doctor machine report before continuing');
assertGate(helper.includes('isProjectReceiptCurrentForEpoch'), 'project receipts must be compared against the current installation epoch');
assertGate(helper.includes('clearPendingUpdateMigration') && helper.includes('one project must not consume global migration state'), 'legacy clear helper must preserve the persistent epoch contract');
assertGate(scriptContains('update:first-command-migration', 'update-first-command-migration-check.js'), 'package script must expose first command migration gate');

emitGate('update:first-command-migration');
