#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { repairSupabaseMcp } from '../core/doctor/supabase-mcp-repair.js';
import path from 'node:path';

const root = await makeTempRoot('sks-supabase-mcp-');
delete process.env.SUPABASE_ACCESS_TOKEN;
await writeText(path.join(root, '.codex', 'config.toml'), '[mcp_servers.supabase]\nurl = "https://supabase.example/mcp"\nread_only = true\n');
const report = await repairSupabaseMcp({ root, apply: true });
assertGate(report.ok === true && report.manual_required === true && report.raw_secret_values_recorded === false, 'Supabase MCP repair must mark unset token as manual for write features without blocking read-only readiness', report);
emitGate('doctor:supabase-mcp-repair');
