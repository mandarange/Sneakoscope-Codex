#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText, scriptContains } from './sks-1-18-gate-lib.js';

const helper = readText('src/core/update/update-migration-state.ts');

assertGate(helper.includes('migration.lock'), 'migration gate must use a lock file');
assertGate(helper.includes("fsp.open(lockPath, 'wx')"), 'migration lock must be exclusive-create');
assertGate(helper.includes('update_migration_lock_held'), 'migration gate must report held locks as blockers');
assertGate(helper.includes('removeStaleMigrationLock') && helper.includes('pidAlive') && helper.includes('120_000'), 'migration gate must reap stale lock files without weakening live lock protection');
assertGate(scriptContains('update:concurrent-lock', 'update-concurrent-lock-check.js'), 'package script must expose concurrent lock gate');

emitGate('update:concurrent-lock');
