import path from 'node:path';
import { initProject } from '../init.js';
import { findLatestMission, setCurrent } from '../mission.js';
import { exists, readText, sksRoot } from '../fsx.js';
import { closeMadDbCycle, isMadDbCapabilityActive, MAD_DB_ACK, readMadDbCapability, resolveMadDbMissionId, revokeMadDbCapability } from '../mad-db/mad-db-capability.js';
import { closeMadDbRuntimeProfile, verifyReadOnlyRestored } from '../mad-db/mad-db-runtime-profile.js';
import { runMadDbCycle } from '../mad-db/mad-db-coordinator.js';
import { resolveMadDbTarget } from '../mad-db/mad-db-target.js';
import { quarantineStaleMadDbRuntimeProfiles } from '../mad-db/mad-db-recovery.js';
import { sha256 } from '../fsx.js';

export async function madDbCommand(args: string[] = []) {
  const action = String(args[0] && !String(args[0]).startsWith('--') ? args[0] : 'status');
  const rest = action === args[0] ? args.slice(1) : args;
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  if (action === 'run') return runMadDb(root, rest);
  if (action === 'exec') return execMadDb(root, rest);
  if (action === 'apply-migration') return applyMigrationMadDb(root, rest);
  if (action === 'doctor') return doctorMadDb(root, rest);
  if (action === 'close') return closeMadDb(root, rest);
  if (action === 'enable') return enableMadDb(root, rest);
  if (action === 'revoke') return revokeMadDb(root, rest);
  if (action === 'status') return statusMadDb(root, rest);
  console.error('Usage: sks mad-db run "<task-or-sql>" | exec --sql "<SQL>" | apply-migration --name <name> --file <sql-file> | doctor|status|close|revoke [--json]');
  process.exitCode = 1;
}

async function runMadDb(root: string, args: string[]) {
  const task = positionalText(args) || readOption(args, '--task', '');
  const sql = readOption(args, '--sql', '');
  const result = await runMadDbCycle({
    root,
    action: 'run',
    task,
    sql: sql || null,
    verifySql: readOption(args, '--verify-sql', '') || null,
    args
  });
  return printResult(result, args);
}

async function execMadDb(root: string, args: string[]) {
  const sql = readOption(args, '--sql', '') || positionalText(args);
  const result = await runMadDbCycle({
    root,
    action: 'exec',
    task: sql || 'sks mad-db exec',
    sql: sql || null,
    verifySql: readOption(args, '--verify-sql', '') || null,
    args
  });
  return printResult(result, args);
}

async function applyMigrationMadDb(root: string, args: string[]) {
  const file = readOption(args, '--file', '');
  const sql = readOption(args, '--sql', '') || (file ? await readText(path.resolve(file), '') : '');
  const result = await runMadDbCycle({
    root,
    action: 'apply-migration',
    task: `apply migration ${readOption(args, '--name', 'mad_db_migration')}`,
    sql: sql || null,
    migrationName: readOption(args, '--name', `mad_db_${Date.now()}`),
    migrationFile: file || null,
    verifySql: readOption(args, '--verify-sql', '') || null,
    args
  });
  return printResult(result, args);
}

async function doctorMadDb(root: string, args: string[]) {
  const target = await resolveMadDbTarget(root, { args });
  const recovery = await quarantineStaleMadDbRuntimeProfiles(root);
  const restoration = await verifyReadOnlyRestored(root, null);
  const result = {
    schema: 'sks.mad-db-doctor.v1',
    ok: target.blockers.length === 0 && restoration.persistent_supabase_read_only,
    target: { ...target, project_ref: target.project_ref ? `<hash:${target.project_ref_hash}>` : null },
    stale_recovery: recovery,
    read_only_restoration: restoration,
    execute_sql_apply_migration_inventory_checked: false,
    note: 'doctor does not open write transport; run/exec/apply-migration verifies tool inventory inside a bound cycle'
  };
  return printJsonOrText(result, args, result.ok ? 'MadDB doctor passed local checks.' : `MadDB doctor found blockers: ${[...target.blockers, ...restoration.blockers].join(', ')}`);
}

async function enableMadDb(root: string, args: string[]) {
  const json = hasFlag(args, '--json');
  const ack = readOption(args, '--ack', '');
  if (ack !== MAD_DB_ACK) {
    const result = { schema: 'sks.mad-db-command.v2', ok: false, action: 'enable', reason: 'deprecated_enable_no_capability', required_ack: MAD_DB_ACK, token_only: true };
    if (json) return console.log(JSON.stringify(result, null, 2));
    console.error(`MadDB enable is deprecated and does not create a capability. Use sks mad-db run|exec|apply-migration for an executable cycle. Legacy ack was ${JSON.stringify(MAD_DB_ACK)}.`);
    process.exitCode = 2;
    return result;
  }
  const result = {
    schema: 'sks.mad-db-command.v2',
    ok: false,
    action: 'enable',
    reason: 'deprecated_enable_no_capability',
    token_only: true,
    executable_commands: ['sks mad-db run', 'sks mad-db exec', 'sks mad-db apply-migration']
  };
  if (json) return console.log(JSON.stringify(result, null, 2));
  console.error('MadDB enable no longer creates a capability. Use sks mad-db run|exec|apply-migration to create the bound mission/profile/capability and execute SQL.');
  process.exitCode = 2;
  return result;
}

async function statusMadDb(root: string, args: string[]) {
  const missionId = await resolveMadDbMissionId(root, {}, readOption(args, '--mission', 'latest'));
  const capability = missionId ? await readMadDbCapability(root, missionId) : null;
  const result = {
    schema: 'sks.mad-db-status.v2',
    ok: true,
    action: 'status',
    mission_id: missionId,
    active: isMadDbCapabilityActive(capability),
    capability: capability ? redactCapability(capability) : null
  };
  return printJsonOrText(result, args, !missionId || !capability ? 'MadDB: no capability found.' : `MadDB: ${result.active ? 'active' : 'inactive'} for ${missionId}; status=${capability.status}; expires=${capability.expires_at}.`);
}

async function closeMadDb(root: string, args: string[]) {
  const missionId = await resolveMadDbMissionId(root, {}, readOption(args, '--mission', 'latest')) || await findLatestMission(root);
  const capability = missionId ? await readMadDbCapability(root, missionId) : null;
  const restoration = missionId ? await closeMadDbRuntimeProfile({ root, missionId, reason: 'operator_close' }) : null;
  const closed = missionId && capability ? await closeMadDbCycle(root, missionId, capability.cycle_id, 'operator_close') : null;
  if (missionId) await setCurrent(root, { mad_db_active: false, phase: 'MADDB_CLOSED' });
  const result = { schema: 'sks.mad-db-close.v2', ok: Boolean(closed), action: 'close', mission_id: missionId, capability: closed ? redactCapability(closed) : null, read_only_restoration: restoration };
  return printJsonOrText(result, args, closed ? `MadDB cycle closed for ${missionId}.` : 'MadDB: no capability to close.');
}

async function revokeMadDb(root: string, args: string[]) {
  const missionId = await resolveMadDbMissionId(root, {}, readOption(args, '--mission', 'latest')) || await findLatestMission(root);
  const revoked = missionId ? await revokeMadDbCapability(root, missionId, readOption(args, '--reason', 'operator_revoked')) : null;
  const restoration = missionId ? await closeMadDbRuntimeProfile({ root, missionId, reason: 'operator_revoke' }) : null;
  await setCurrent(root, { mad_db_active: false, phase: 'MADDB_REVOKED' });
  const result = { schema: 'sks.mad-db-command.v2', ok: Boolean(revoked), action: 'revoke', mission_id: missionId, capability: revoked ? redactCapability(revoked) : null, read_only_restoration: restoration };
  return printJsonOrText(result, args, revoked ? `MadDB capability revoked for ${missionId}.` : 'MadDB: no capability to revoke.');
}

function printResult(result: any, args: string[]) {
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`MadDB complete: mission=${result.mission_id} cycle=${result.cycle_id} execution=${result.execution?.ok ? 'succeeded' : 'unknown'} verification=${result.read_back?.ok === true ? 'passed' : 'not-requested'} read-only-restored=${result.read_only_restoration?.ok === true}`);
  } else {
    console.error(`MadDB failed: mission=${result.mission_id} blockers=${(result.blockers || []).join(', ') || 'unknown'} read-only-restored=${result.read_only_restoration?.ok === true}`);
    process.exitCode = 1;
  }
  return result;
}

function printJsonOrText(result: any, args: string[], text: string) {
  if (hasFlag(args, '--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(text);
  if (result.ok === false) process.exitCode = process.exitCode || 1;
  return result;
}

function redactCapability(capability: any) {
  return {
    ...capability,
    project_ref: capability.project_ref ? `<hash:${sha256(capability.project_ref).slice(0, 16)}>` : null,
    transport: capability.transport ? { ...capability.transport, server_url_redacted: capability.transport.server_url_redacted || '<redacted>' } : null
  };
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

function readOption(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return String(args[index + 1]);
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function positionalText(args: string[]) {
  const out = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      if (!arg.includes('=') && args[index + 1] && !String(args[index + 1]).startsWith('--')) index += 1;
      continue;
    }
    out.push(arg);
  }
  return out.join(' ').trim();
}
