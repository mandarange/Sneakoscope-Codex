#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, packageScripts, readText, releaseGateIds } from './lib/codex-sdk-gate-lib.js';

const scripts = packageScripts();
const releaseRealCheck = String(scripts['release:real-check'] || '');
const releaseRealCheckSource = readText('src/scripts/release-real-check.ts');
const releaseGates = releaseGateIds();
assertGate(releaseGates.has('codex-sdk:capability'), 'release gate DAG must include Codex SDK capability gate');
assertGate(releaseGates.has('codex-sdk:all-pipelines'), 'release gate DAG must include Codex SDK all-pipelines gate');
assertGate(releaseRealCheck.includes('codex-sdk:real-smoke') || releaseRealCheckSource.includes('codex-sdk:real-smoke'), 'release:real-check must include Codex SDK real smoke');
assertGate(readText('src/core/agents/agent-orchestrator.ts').includes('legacy_codex_exec_runtime_removed'), 'orchestrator must block legacy codex-exec requests');
emitGate('codex-sdk:release-review-pipeline', { release_gate_dag_contains_sdk: true });
