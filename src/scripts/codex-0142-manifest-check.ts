#!/usr/bin/env node
import { assertGate, emitGate, readJson, root } from './sks-1-18-gate-lib.js';
import { codexReleaseManifestParity } from '../core/codex-compat/codex-release-manifest.js';

const parity = await codexReleaseManifestParity(root);
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const manifest = parity.manifest;
const dep = pkg.dependencies?.['@openai/codex-sdk'];
const lockSdk = lock.packages?.['node_modules/@openai/codex-sdk']?.version;
const lockCli = lock.packages?.['node_modules/@openai/codex']?.version;
assertGate(parity.ok, 'Codex release manifest TS/JSON parity must hold', parity);
assertGate(dep === manifest.sdkVersion, 'package.json must pin @openai/codex-sdk exactly to manifest sdkVersion', { dep, sdkVersion: manifest.sdkVersion });
assertGate(lockSdk === manifest.sdkVersion, 'package-lock must resolve @openai/codex-sdk to manifest sdkVersion', { lockSdk, sdkVersion: manifest.sdkVersion });
assertGate(lockCli === manifest.requiredCliVersion, 'package-lock must resolve @openai/codex to manifest requiredCliVersion', { lockCli, requiredCliVersion: manifest.requiredCliVersion });
assertGate(pkg.version === '4.1.1', 'package version must be 4.1.1', { version: pkg.version });
emitGate('codex:0142:manifest', {
  manifest_sha256: parity.manifest_sha256,
  target_tag: manifest.targetTag,
  sdk_version: manifest.sdkVersion
});
