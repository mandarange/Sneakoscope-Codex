#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText, scriptContains } from './sks-1-18-gate-lib.js';

const router = readText('src/cli/router.ts');
const helper = readText('src/core/update/update-migration-state.ts');

assertGate(router.includes('ensureCurrentMigrationBeforeCommand'), 'router must call first-command migration gate before lazy command dispatch');
assertGate(helper.includes('pendingUpdateMigrationPath'), 'migration helper must keep a global pending marker');
assertGate(helper.includes('projectUpdateMigrationReceiptPath'), 'migration helper must keep a project receipt');
assertGate(helper.includes("args: ['doctor', '--fix', '--json']"), 'first normal command must repair through package-local Doctor before continuing');
assertGate(helper.includes('clearPendingUpdateMigration'), 'current project receipt must clear pending migration marker');
assertGate(scriptContains('update:first-command-migration', 'update-first-command-migration-check.js'), 'package script must expose first command migration gate');

emitGate('update:first-command-migration');
