#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/codex/managed-proxy-env.js');
const env = {
  HTTPS_PROXY: 'http://user:secret@example.test:8080',
  NO_PROXY: 'localhost,127.0.0.1'
};
const childEnv = mod.managedProxyEnvForChild(env);
const report = mod.detectManagedProxyEnv(env);

assertGate(report.ok === true, 'managed proxy env report must be ok', report);
assertGate(report.keys_present.includes('HTTPS_PROXY'), 'managed proxy env must detect HTTPS_PROXY', report);
assertGate(childEnv.HTTPS_PROXY.includes('secret'), 'child env keeps the real proxy value for process propagation', report);
assertGate(!JSON.stringify(report).includes('secret'), 'managed proxy env report must not persist raw proxy secret', report);
assertGate(!report.redacted.HTTPS_PROXY.includes('secret'), 'redacted report must not expose proxy password', report);
emitGate('codex:managed-proxy-env', { keys: report.keys_present });
