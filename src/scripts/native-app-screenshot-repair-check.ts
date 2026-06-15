#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';

const root = await makeTempRoot('sks-native-appshot-');
const report = await repairNativeCapabilities({ root, fix: true, yes: true, capabilities: ['codex_app_screenshot'], fixture: 'all-repairable' });
const registry = await fs.stat(path.join(root, '.sneakoscope', 'app-screenshots', 'screenshot-registry.json')).then(() => true, () => false);
assertGate(registry && report.capabilities[0]?.after === 'verified', 'app screenshot repair must create registry and verify writable path', report);
emitGate('native:app-screenshot-repair');
