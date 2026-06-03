#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, packageScripts, readText } from './lib/codex-sdk-gate-lib.js';

const scripts = packageScripts();
assertGate(Boolean(scripts['core-skill:route-runtime-integration']), 'Core skill route integration gate missing');
assertGate(readText('src/core/skills/core-skill-types.ts').includes("'codex-sdk'"), 'Core skill backend type must include codex-sdk');
assertGate(readText('src/core/agents/agent-roster.ts').includes("backend === 'codex-sdk'"), 'Agent roster must treat codex-sdk as heavy backend');
emitGate('codex-sdk:core-skill-pipeline', { core_skill_backend: 'codex-sdk' });
