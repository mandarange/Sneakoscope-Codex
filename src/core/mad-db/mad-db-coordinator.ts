import path from 'node:path';
import { createMission, missionDir, setCurrent } from '../mission.js';
import { nowIso, readJson, readText, sha256, writeJsonAtomic } from '../fsx.js';
import { createMadDbCapability, activateMadDbCapability, closeMadDbCycle, MAD_DB_ACK, markMadDbTransportReady, readMadDbCapability, type MadDbCapabilityV2 } from './mad-db-capability.js';
import { MadDbMcpExecutor, type MadDbToolInventory, type MadDbToolResult } from './mad-db-executor.js';
import { createMadDbRuntimeProfile, closeMadDbRuntimeProfile, redactedRuntimeProfile, type MadDbRuntimeProfile, type ReadOnlyRestorationProof } from './mad-db-runtime-profile.js';
import { reserveMadDbOperation, transitionMadDbOperation, type MadDbOperationV2 } from './mad-db-operation-store.js';
import { readBackCheck, runReadBackChecks, type MadDbReadBackProof } from './mad-db-postconditions.js';
import { madDbOperationClassesFromClassification } from './mad-db-policy.js';
import { projectRootHash, resolveMadDbTarget, type MadDbTarget } from './mad-db-target.js';
import { classifySql } from '../db-safety.js';

export interface MadDbPreparedMission {
  schema: 'sks.mad-db-prepared-mission.v1';
  ok: boolean;
  mission_id: string;
  cycle_id: string;
  target: MadDbTarget;
  capability: MadDbCapabilityV2;
  runtime_profile: Omit<MadDbRuntimeProfile, 'server_url'>;
  tool_inventory: MadDbToolInventory | null;
  blockers: string[];
}

export interface MadDbCycleResult {
  schema: 'sks.mad-db-cycle-result.v1';
  ok: boolean;
  mission_id: string;
  cycle_id: string;
  action: 'exec' | 'apply-migration' | 'run';
  target: MadDbTarget;
  tool_inventory: MadDbToolInventory | null;
  execution: MadDbToolResult | null;
  operation: MadDbOperationV2 | null;
  read_back: MadDbReadBackProof | null;
  read_only_restoration: ReadOnlyRestorationProof;
  capability_closed: boolean;
  timings_ms: Record<string, number>;
  blockers: string[];
}

export async function prepareMadDbMission(input: {
  root: string;
  task: string;
  args?: string[];
  verifyTools?: boolean;
  runtimeSessionId?: string;
}): Promise<MadDbPreparedMission> {
  const target = await resolveMadDbTarget(input.root, { args: input.args || [] });
  const { id, dir } = await createMission(input.root, { mode: 'mad-db', prompt: input.task || 'MadDB SQL-plane execution' });
  const cycleId = `mad-db-${Date.now().toString(36)}`;
  const runtimeSessionId = input.runtimeSessionId || `mad-db-session-${Date.now().toString(36)}`;
  const blockers = [...target.blockers];
  let profile: MadDbRuntimeProfile;
  if (!target.project_ref) {
    profile = await createMadDbRuntimeProfile({ root: input.root, missionId: id, cycleId, projectRef: 'missing-project-ref', runtimeSessionId });
  } else {
    profile = await createMadDbRuntimeProfile({ root: input.root, missionId: id, cycleId, projectRef: target.project_ref, runtimeSessionId });
  }
  const capability = await createMadDbCapability(input.root, {
    missionId: id,
    ack: MAD_DB_ACK,
    cwd: input.root,
    cycleId,
    projectRef: target.project_ref || 'missing-project-ref',
    targetEnvironment: target.target_environment,
    allowedSchemas: target.allowed_schemas,
    runtimeSessionId,
    operatorIntent: input.task,
    profilePath: profile.profile_path,
    profileSha256: profile.profile_sha256,
    serverUrlRedacted: profile.server_url_redacted,
    operations: [...madDbOperationClassesFromClassification(classifySql(input.task))],
    status: blockers.length ? 'quarantined' : 'transport_ready'
  });
  let toolInventory: MadDbToolInventory | null = null;
  if (input.verifyTools && !blockers.length) {
    const executor = new MadDbMcpExecutor(profile);
    toolInventory = await executor.inventory();
    await executor.close();
    await writeJsonAtomic(path.join(dir, 'mad-db', 'runtime', 'tool-inventory.json'), toolInventory);
    if (!toolInventory.ok) blockers.push('mad_db_execute_sql_or_apply_migration_unavailable');
    else await markMadDbTransportReady(input.root, id);
  }
  await writeJsonAtomic(path.join(dir, 'route-context.json'), {
    route: 'MadDB',
    command: '$MAD-DB',
    mode: 'MADDB',
    task: input.task,
    target: { ...target, project_ref: target.project_ref ? `<hash:${target.project_ref_hash}>` : null },
    capability_file: 'mad-db-capability.json',
    runtime_profile_manifest: 'mad-db/runtime/runtime-profile-manifest.json',
    tool_inventory: toolInventory ? 'mad-db/runtime/tool-inventory.json' : null
  });
  await writeJsonAtomic(path.join(dir, 'mad-db-gate.json'), {
    schema: 'sks.mad-db-gate.v1',
    passed: false,
    mad_db_capability_active: !blockers.length,
    sql_plane_all_mutations_allowed: !blockers.length,
    control_plane_denied: true,
    mission_id: id,
    cycle_id: cycleId,
    blockers,
    created_at: nowIso()
  });
  await setCurrent(input.root, {
    mission_id: id,
    mad_db_capability_mission_id: id,
    route: 'MadDB',
    route_command: '$MAD-DB',
    mode: 'MADDB',
    phase: blockers.length ? 'MADDB_BLOCKED' : 'MADDB_SQL_PLANE_CAPABILITY_ACTIVE',
    questions_allowed: false,
    implementation_allowed: !blockers.length,
    mad_db_active: !blockers.length,
    mad_db_cycle_id: cycleId,
    mad_db_runtime_session_id: runtimeSessionId,
    mad_db_profile_sha256: profile.profile_sha256,
    mad_db_capability_file: 'mad-db-capability.json',
    stop_gate: 'mad-db-gate.json',
    prompt: input.task
  });
  return {
    schema: 'sks.mad-db-prepared-mission.v1',
    ok: blockers.length === 0,
    mission_id: id,
    cycle_id: cycleId,
    target,
    capability,
    runtime_profile: redactedRuntimeProfile(profile),
    tool_inventory: toolInventory,
    blockers
  };
}

export async function runMadDbCycle(input: {
  root: string;
  action: 'exec' | 'apply-migration' | 'run';
  task: string;
  sql?: string | null;
  migrationName?: string | null;
  migrationFile?: string | null;
  verifySql?: string | null;
  args?: string[];
}): Promise<MadDbCycleResult> {
  const timings: Record<string, number> = {};
  const start = Date.now();
  const prepared = await prepareMadDbMission({ root: input.root, task: input.task, args: input.args || [], verifyTools: false });
  timings.prepare_ms = Date.now() - start;
  const profile = await recreateProfileFromPrepared(input.root, prepared);
  const executor = new MadDbMcpExecutor(profile);
  let inventory: MadDbToolInventory | null = null;
  let execution: MadDbToolResult | null = null;
  let operation: MadDbOperationV2 | null = null;
  let readBack: MadDbReadBackProof | null = null;
  const blockers = [...prepared.blockers];
  try {
    const connectStart = Date.now();
    inventory = await executor.inventory();
    timings.mcp_connect_ms = Date.now() - connectStart;
    await writeJsonAtomic(path.join(missionDir(input.root, prepared.mission_id), 'mad-db', 'runtime', 'tool-inventory.json'), inventory);
    if (!inventory.ok) {
      blockers.push('mad_db_execute_sql_or_apply_migration_unavailable');
      throw new Error('mad_db_tool_inventory_failed');
    }
    await activateMadDbCapability(input.root, prepared.mission_id);
    const sql = await resolveSqlInput(input);
    if (!sql) {
      blockers.push('mad_db_sql_missing_for_execution');
      throw new Error('mad_db_sql_missing_for_execution');
    }
    const classification = classifySql(sql);
    const toolName = input.action === 'apply-migration' ? 'apply_migration' : 'execute_sql';
    const toolCallId = `cli-${input.action}-${sha256(`${prepared.mission_id}:${sql}:${Date.now()}`).slice(0, 16)}`;
    const reservation = await reserveMadDbOperation({
      root: input.root,
      missionId: prepared.mission_id,
      capability: prepared.capability,
      toolCallId,
      toolName,
      sql,
      migrationName: input.migrationName || null,
      operationClasses: madDbOperationClassesFromClassification({ ...classification, toolName })
    });
    await transitionMadDbOperation({ root: input.root, missionId: prepared.mission_id, toolCallId, state: 'started' });
    const execStart = Date.now();
    execution = input.action === 'apply-migration'
      ? await executor.applyMigration(input.migrationName || `mad_db_${Date.now()}`, sql)
      : await executor.executeSql(sql);
    timings.execution_ms = Date.now() - execStart;
    operation = await transitionMadDbOperation({
      root: input.root,
      missionId: prepared.mission_id,
      toolCallId,
      state: execution.ok ? 'succeeded' : 'failed',
      result: execution
    });
    if (!execution.ok) blockers.push('mad_db_tool_execution_failed');
    if (execution.ok && input.verifySql) {
      const verifyStart = Date.now();
      readBack = await runReadBackChecks({
        root: input.root,
        missionId: prepared.mission_id,
        executor,
        checks: [readBackCheck('operator_verify_sql', input.verifySql)]
      });
      timings.verification_ms = Date.now() - verifyStart;
      if (!readBack.ok) blockers.push('mad_db_read_back_verification_failed');
      if (operation) {
        operation = await transitionMadDbOperation({
          root: input.root,
          missionId: prepared.mission_id,
          toolCallId,
          state: readBack.ok ? 'verified' : 'verification_failed',
          verificationArtifact: readBack.proof_path || null
        }) || operation;
      }
    }
  } catch (err: unknown) {
    if (!blockers.length) blockers.push(err instanceof Error ? err.message : String(err));
  } finally {
    await executor.close();
  }
  const closeStart = Date.now();
  const restoration = await closeMadDbRuntimeProfile({ root: input.root, missionId: prepared.mission_id, profile, reason: 'mad_db_cycle_finally' });
  await closeMadDbCycle(input.root, prepared.mission_id, prepared.cycle_id, 'mad_db_cycle_finally');
  timings.close_ms = Date.now() - closeStart;
  timings.total_ms = Date.now() - start;
  const result: MadDbCycleResult = {
    schema: 'sks.mad-db-cycle-result.v1',
    ok: blockers.length === 0 && execution?.ok === true && restoration.ok,
    mission_id: prepared.mission_id,
    cycle_id: prepared.cycle_id,
    action: input.action,
    target: prepared.target,
    tool_inventory: inventory,
    execution,
    operation,
    read_back: readBack,
    read_only_restoration: restoration,
    capability_closed: true,
    timings_ms: timings,
    blockers: restoration.ok ? blockers : [...blockers, ...restoration.blockers]
  };
  await writeJsonAtomic(path.join(missionDir(input.root, prepared.mission_id), 'mad-db-result.json'), redactCycleResult(result));
  await clearMadDbCurrentState(input.root, prepared.mission_id, result.ok, restoration);
  return result;
}

async function clearMadDbCurrentState(root: string, missionId: string, ok: boolean, restoration: ReadOnlyRestorationProof) {
  const currentPath = path.join(root, '.sneakoscope', 'state', 'current.json');
  const current = await readJson(currentPath, {});
  if (current.mission_id !== missionId && current.mad_db_capability_mission_id !== missionId) return;
  await setCurrent(root, {
    phase: ok ? 'MADDB_CLOSED' : 'MADDB_FAILED_CLOSED',
    implementation_allowed: false,
    mad_db_active: false,
    mad_db_runtime_session_id: null,
    mad_db_profile_sha256: null,
    mad_db_read_only_restored: restoration.ok,
    mad_db_closed_at: nowIso(),
    mad_db_last_result_file: 'mad-db-result.json'
  });
}

function redactCycleResult(result: MadDbCycleResult): MadDbCycleResult {
  return {
    ...result,
    target: {
      ...result.target,
      project_ref: result.target.project_ref ? '<redacted>' : null
    }
  };
}

async function resolveSqlInput(input: { action: string; task: string; sql?: string | null; migrationFile?: string | null }) {
  if (input.sql) return input.sql;
  if (input.migrationFile) return readText(path.resolve(input.migrationFile), '');
  const trimmed = String(input.task || '').trim();
  return /^(select|with|show|explain|describe|insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i.test(trimmed) ? trimmed : null;
}

async function recreateProfileFromPrepared(root: string, prepared: MadDbPreparedMission): Promise<MadDbRuntimeProfile> {
  const projectRef = prepared.target.project_ref || 'missing-project-ref';
  return {
    schema: 'sks.mad-db-runtime-profile.v1',
    mission_id: prepared.mission_id,
    cycle_id: prepared.cycle_id,
    runtime_session_id: prepared.capability.runtime_session_id,
    project_ref_hash: sha256(projectRef).slice(0, 16),
    profile_path: prepared.runtime_profile.profile_path,
    profile_sha256: prepared.runtime_profile.profile_sha256,
    server_url_redacted: prepared.runtime_profile.server_url_redacted,
    server_url: `https://mcp.supabase.com/mcp?project_ref=${encodeURIComponent(projectRef)}&features=database`,
    features: ['database'],
    write_capable: true,
    normal_config_hash_before: prepared.runtime_profile.normal_config_hash_before,
    created_at: prepared.runtime_profile.created_at
  };
}

export async function madDbRouteIdentityProof(root: string, missionId: string) {
  const capability = await readMadDbCapability(root, missionId);
  const state = await readJson<any>(path.join(root, '.sneakoscope', 'state', 'current.json'), {});
  const profile = await readJson<any>(path.join(missionDir(root, missionId), 'mad-db', 'runtime', 'runtime-profile-manifest.json'), null);
  const sameMission = Boolean(capability && capability.mission_id === missionId && state?.mission_id === missionId);
  return {
    schema: 'sks.mad-db-route-identity-proof.v1',
    ok: sameMission && state?.route === 'MadDB' && state?.route_command === '$MAD-DB',
    mission_id: missionId,
    capability_mission_id: capability?.mission_id || null,
    same_mission: sameMission,
    route: state?.route || null,
    route_command: state?.route_command || null,
    cycle_id: capability?.cycle_id || null,
    project_root_hash: await projectRootHash(root),
    runtime_profile: profile,
    blockers: [
      ...(capability ? [] : ['capability_missing']),
      ...(profile ? [] : ['runtime_profile_manifest_missing']),
      ...(sameMission ? [] : ['mission_binding_mismatch']),
      ...(state?.route === 'MadDB' ? [] : ['route_state_not_maddb']),
      ...(state?.route_command === '$MAD-DB' ? [] : ['route_command_not_maddb'])
    ]
  };
}
