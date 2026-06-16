#!/usr/bin/env node
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { repairCodexStartupConfig } from '../core/doctor/codex-startup-config-repair.js';
import { repairContext7Mcp } from '../core/doctor/context7-mcp-repair.js';
import { repairSupabaseMcp } from '../core/doctor/supabase-mcp-repair.js';
import { writeDoctorFixTransaction } from '../core/doctor/doctor-transaction.js';
import { doctorRepairPostcheck } from '../core/doctor/doctor-repair-postcheck.js';

const root = await makeTempRoot('sks-doctor-production-');
await writeText(path.join(root, '.codex', 'config.toml'), '[mcp_servers.context7]\ncommand = "npx"\n\n[mcp_servers.supabase]\nurl = "https://supabase.example/mcp"\nread_only = true\n\nconfig_file = ".codex/agents/stale.toml"\nmessage_role_prefix = "legacy"\n');
const startup = await repairCodexStartupConfig({ root, apply: true });
const context7 = await repairContext7Mcp({ root, apply: true });
const supabase = await repairSupabaseMcp({ root, apply: true });
const tx = await writeDoctorFixTransaction({ root, phases: [
  { id: 'preflight', ok: true },
  { id: 'codex_startup_config_repair', ok: startup.ok, repaired: true, blockers: startup.blockers },
  { id: 'context7_mcp_repair', ok: context7.ok, repaired: context7.repaired, blockers: context7.blockers },
  { id: 'supabase_mcp_repair', ok: supabase.ok, manual_required: supabase.manual_required, blockers: supabase.blockers, warnings: supabase.warnings },
  { id: 'postcheck', ok: true }
] });
const postcheck = doctorRepairPostcheck(tx);
assertGate(tx.schema === 'sks.doctor-fix-transaction.v1' && tx.raw_secret_values_recorded === false, 'doctor transaction must write production schema without raw secrets', tx);
assertGate(postcheck.ok === true, 'doctor repair postcheck must pass when only manual-required optional phases remain', postcheck);
emitGate('doctor:fix-production-blackbox', { phases: tx.phases.length });
