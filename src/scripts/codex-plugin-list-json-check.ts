#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const source = readText('src/core/codex/codex-0-137-compat.ts');
assertGate(source.includes("run(['plugin', 'list', '--json'])"), '0.137 evidence must run codex plugin list --json');
assertGate(source.includes('looksLikeJson'), '0.137 plugin list JSON parser missing');
emitGate('codex:plugin-list-json', { detector: 'codex plugin list --json' });
