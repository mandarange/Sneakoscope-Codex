#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex-control/codex-sdk-capability.js');
const capability = await mod.detectCodexSdkCapability();
assertGate(capability.ok, 'Codex Control Plane requires Codex SDK capability', capability);
assertGate(capability.package_name === '@openai/codex-sdk', 'Codex SDK package name mismatch', capability);
assertGate(capability.dynamic_import_ok === true, 'Codex SDK dynamic import failed', capability);
emitGate('codex-control:capability', { package_version: capability.package_version, node_version: capability.node_version });
