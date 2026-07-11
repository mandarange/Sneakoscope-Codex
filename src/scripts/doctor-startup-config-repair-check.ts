#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { repairCodexStartupConfig } from '../core/doctor/codex-startup-config-repair.js';
import path from 'node:path';

const root = await makeTempRoot('sks-startup-config-');
await writeText(path.join(root, '.codex', 'config.toml'), '# SKS managed Codex config fixture\n[agents.analysis_scout]\nconfig_file = ".codex/agents/missing.toml"\nmessage_role_prefix = "legacy"\n');
const report = await repairCodexStartupConfig({ root, apply: true });
assertGate(report.ok === true, 'startup config repair must repair stale config_file paths and unsupported fields', report);
emitGate('doctor:startup-config-repair');
