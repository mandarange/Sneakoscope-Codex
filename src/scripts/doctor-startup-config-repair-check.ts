#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { repairCodexStartupConfig } from '../core/doctor/codex-startup-config-repair.js';
import { MANAGED_OFFICIAL_SUBAGENT_ROLES } from '../core/managed-assets/managed-assets-manifest.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'smol-toml';

const root = await makeTempRoot('sks-startup-config-');
await writeText(path.join(root, '.codex', 'config.toml'), '# SKS managed Codex config fixture\n[agents.analysis_scout]\nconfig_file = ".codex/agents/missing.toml"\nmessage_role_prefix = "legacy"\n');
const codexHome = path.join(root, 'codex-home');
const report = await repairCodexStartupConfig({ root, apply: true, home: path.join(root, 'home'), codexHome });
const text = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
const parsed = parse(text);
const agents = (parsed as any).agents || {};
const files = (await fs.readdir(path.join(root, '.codex', 'agents'))).sort();
assertGate(report.ok === true, 'startup config repair must install the official project config and agent files', report);
assertGate(agents.max_concurrent_threads_per_session === 12 && agents.max_threads === undefined && agents.max_depth === 1 && agents.interrupt_message === true && agents.enabled === true, 'startup config repair must write official [agents] defaults', agents);
const expectedRoleFiles = MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.filename).sort();
assertGate(files.join(',') === expectedRoleFiles.join(','), 'startup config repair must create exactly the official managed role TOMLs', files);
assertGate(text.includes('[agents.analysis_scout]') && text.includes('config_file = ".codex/agents/missing.toml"') && text.includes('message_role_prefix = "legacy"'), 'legacy agent config must be preserved without synthesizing its TOML', text);
emitGate('doctor:startup-config-repair');
