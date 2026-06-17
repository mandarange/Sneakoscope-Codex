#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { repairContext7Mcp } from '../core/doctor/context7-mcp-repair.js';
import path from 'node:path';

const root = await makeTempRoot('sks-context7-');
await writeText(path.join(root, '.codex', 'config.toml'), '[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp"]\n');
const report = await repairContext7Mcp({ root, apply: true });
assertGate(report.ok === true && report.after_transport === 'remote', 'Context7 MCP repair must migrate stdio config to remote when safe', report);
assertGate(report.remote_probe_status === 'skipped' && report.disabled_preserved === false, 'Context7 MCP repair must record remote probe/disabled preservation status', report);
emitGate('doctor:context7-mcp-repair');
