#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';

const root = await makeTempRoot('sks-native-repair-');
process.env.SKS_CHROME_EXTENSION_READY = '1';
process.env.SKS_COMPUTER_USE_CAPABILITY = 'verified';
const report = await repairNativeCapabilities({ root, fix: true, yes: true, fixture: 'all-repairable' });
const imageRegistry = await fs.stat(path.join(root, '.sneakoscope', 'image-artifacts', 'image-artifact-registry.json')).then(() => true, () => false);
const screenshotRegistry = await fs.stat(path.join(root, '.sneakoscope', 'app-screenshots', 'screenshot-registry.json')).then(() => true, () => false);
assertGate(report.ok === true, 'repairable native capabilities must verify after repair fixture', report);
assertGate(imageRegistry && screenshotRegistry, 'native repair must create image and screenshot registries', { imageRegistry, screenshotRegistry });
emitGate('native-capability:repair');
