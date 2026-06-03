#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const source = readText('src/core/commands/research-command.ts');
assertGate(source.includes("backend: mock ? 'fake' : 'codex-sdk'"), 'Research pipeline must default native agents to codex-sdk');
assertGate(source.includes("flag(args, '--autoresearch') ? '$AutoResearch' : '$Research'"), 'Research/AutoResearch route selection missing');
emitGate('codex-sdk:research-pipeline', { route: '$Research' });
