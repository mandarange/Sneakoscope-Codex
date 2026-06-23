#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText, scriptContains } from './sks-1-18-gate-lib.js';

const source = readText('src/core/update-check.ts');

assertGate(source.includes("schema: 'sks.update-now.v2'"), 'update now must expose v2 lifecycle schema');
assertGate(source.includes('old_version_doctor_preflight'), 'update now must run old-version Doctor preflight');
assertGate(source.includes('npm_global_install'), 'update now must record guarded npm global install stage');
assertGate(source.includes('new_version_global_doctor'), 'update now must run new-version global Doctor');
assertGate(source.includes('project_receipt'), 'update now must write project migration receipt');
assertGate(source.includes("status: ok ? 'updated' : 'failed'"), 'updated status must depend on full lifecycle ok');
assertGate(scriptContains('update:doctor-lifecycle', 'update-doctor-lifecycle-check.js'), 'package script must expose update doctor lifecycle gate');

emitGate('update:doctor-lifecycle');
