#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';
import path from 'node:path';

const repairableRoot = await makeTempRoot('sks-doctor-native-repairable-');
process.env.SKS_CHROME_EXTENSION_READY = '1';
process.env.SKS_COMPUTER_USE_CAPABILITY = 'verified';
const repairable = await repairNativeCapabilities({ root: repairableRoot, fix: true, yes: true, fixture: 'all-repairable' });
delete process.env.SKS_CHROME_EXTENSION_READY;
delete process.env.SKS_COMPUTER_USE_CAPABILITY;
const manualRoot = await makeTempRoot('sks-doctor-native-manual-');
const manual = await repairNativeCapabilities({ root: manualRoot, fix: true, yes: true, fixture: 'manual-required' });
const screenshotBlockedRoot = await makeTempRoot('sks-doctor-native-screenshot-blocked-');
await writeText(path.join(screenshotBlockedRoot, '.sneakoscope', 'app-screenshots'), 'not-a-directory');
const screenshotBlocked = await repairNativeCapabilities({
  root: screenshotBlockedRoot,
  fix: false,
  yes: true,
  fixture: 'all-repairable',
  capabilities: ['codex_app_screenshot']
});
const corruptContractRoot = await makeTempRoot('sks-doctor-native-contract-repair-');
await writeText(path.join(corruptContractRoot, '.sneakoscope', 'reports', 'saved-artifact-path-contract.json'), '{"schema":"broken"}\n');
const corruptContract = await repairNativeCapabilities({
  root: corruptContractRoot,
  fix: true,
  yes: true,
  fixture: 'manual-required',
  capabilities: ['saved_artifact_path_contract']
});
assertGate(repairable.ok === true, 'repairable fixture must verify after doctor native repair', repairable);
assertGate(manual.capabilities.some((state) => state.repairability === 'manual-required' && state.after !== 'verified'), 'manual-only fixture must not fake verified success', manual);
assertGate(manual.capabilities.find((state) => state.id === 'image_generation')?.after !== 'verified', 'image generation auth missing must not verify', manual);
assertGate(manual.capabilities.find((state) => state.id === 'chrome_web_review')?.after !== 'verified', 'Chrome/web review missing extension must not verify', manual);
assertGate(manual.capabilities.find((state) => state.id === 'image_path_exposure')?.after === 'degraded', 'saved artifact path fallback must be degraded rather than verified', manual);
assertGate(screenshotBlocked.capabilities.find((state) => state.id === 'codex_app_screenshot')?.after === 'blocked', 'unwritable screenshot artifact root must block postcheck', screenshotBlocked);
assertGate(corruptContract.capabilities.find((state) => state.id === 'saved_artifact_path_contract')?.after === 'verified', 'doctor fix must repair corrupt saved artifact path contract', corruptContract);
emitGate('doctor:native-capability-repair-blackbox');
