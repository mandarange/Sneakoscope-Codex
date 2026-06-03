#!/usr/bin/env node
// @ts-nocheck
import { assertFiles, assertGate, emitGate, importDist, AGENT_118_FILES } from './sks-1-18-gate-lib.js';

assertFiles(AGENT_118_FILES);
const mod = await importDist('core/agents/scout-policy.js');
const ok = mod.detectMainScoutCall('native agent orchestrator creates workers');
const bad = mod.detectMainScoutCall('main orchestrator runs sks scouts run now');
assertGate(ok.ok === true, 'ordinary main text must pass no-Scout detector');
assertGate(bad.ok === false, 'main Scout call must be blocked');
emitGate('agent:main-no-scout', { violations_detected: bad.violations.length });
