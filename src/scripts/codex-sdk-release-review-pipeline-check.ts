#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, packageScripts, readText } from './lib/codex-sdk-gate-lib.js';

const scripts = packageScripts();
const releaseCheck = String(scripts['release:check'] || '');
const releaseRealCheck = String(scripts['release:real-check'] || '');
assertGate(releaseCheck.includes('codex-sdk:capability'), 'release:check must include Codex SDK capability gate');
assertGate(releaseCheck.includes('codex-sdk:all-pipelines'), 'release:check must include Codex SDK all-pipelines gate');
assertGate(releaseRealCheck.includes('codex-sdk:real-smoke'), 'release:real-check must include Codex SDK real smoke');
assertGate(readText('src/core/agents/agent-orchestrator.ts').includes('legacy_codex_exec_runtime_removed'), 'orchestrator must block legacy codex-exec requests');
emitGate('codex-sdk:release-review-pipeline', { release_check_contains_sdk: true });
