#!/usr/bin/env node
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './skill-fixture-check-lib.js';
import { repairSupabaseMcp } from '../core/doctor/supabase-mcp-repair.js';

const root = await makeTempRoot('sks-supabase-mcp-blackbox-');
delete process.env.SUPABASE_ACCESS_TOKEN;
await writeText(path.join(root, '.codex', 'config.toml'), '# SKS-MANAGED-CODEX-CONFIG\n[mcp_servers.supabase]\nurl = "https://mcp.supabase.com/mcp?project_ref=fixture"\nread_only = true\nbearer_token_env_var = "SUPABASE_ACCESS_TOKEN"\n');
const unsafe = await repairSupabaseMcp({ root, apply: true });
assertGate(unsafe.ok === true && unsafe.manual_required === false && unsafe.read_only_migrated === true && unsafe.ready_blocking === false, 'Supabase ignored read_only must migrate to the URL without inventing a credential requirement', unsafe);
await writeText(path.join(root, '.codex', 'config.toml'), '[mcp_servers.supabase_sauron]\ndisabled = true\n');
const optional = await repairSupabaseMcp({ root, apply: true });
assertGate(optional.ok === true && optional.disabled === true && optional.disabled_preserved === true, 'optional disabled Supabase config must be preserved', optional);
emitGate('doctor:supabase-mcp-repair-blackbox');
