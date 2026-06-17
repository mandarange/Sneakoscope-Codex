#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { repairCodexStartupConfig } from '../core/doctor/codex-startup-config-repair.js';

const root = await makeTempRoot('sks-startup-config-blackbox-');
await writeText(path.join(root, '.codex', 'config.toml'), '[agents.analysis_scout]\nconfig_file = ".codex/agents/stale.toml"\nmessage_role_prefix = "legacy"\n');
const report = await repairCodexStartupConfig({ root, apply: true });
const text = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
assertGate(report.ok === true, 'startup config blackbox must pass postcheck', report);
assertGate(!text.includes('message_role_prefix') && /config_file = "\//.test(text), 'startup config blackbox must rewrite to absolute config paths and remove unsupported fields', { text });
emitGate('doctor:startup-config-repair-blackbox');
