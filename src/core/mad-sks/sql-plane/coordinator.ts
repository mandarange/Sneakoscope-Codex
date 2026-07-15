import path from 'node:path';
import { createMission, missionDir, setCurrent } from '../../mission.js';
import { ensureDir, nowIso, readJson, readText, sha256, writeJsonAtomic } from '../../fsx.js';
import { createMadSksSqlPlaneCapability, activateMadSksSqlPlaneCapability, closeMadSksSqlPlaneCycle, MAD_SKS_SQL_PLANE_ACK, markMadSksSqlPlaneTransportReady, readMadSksSqlPlaneCapability, type MadSksSqlPlaneCapabilityV2 } from './capability.js';
import { MadSksSqlPlaneMcpExecutor, type MadSksSqlPlaneToolInventory, type MadSksSqlPlaneToolResult } from './mcp-executor.js';
import { createMadSksSqlPlaneRuntimeProfile, closeMadSksSqlPlaneRuntimeProfile, redactedRuntimeProfile, type MadSksSqlPlaneRuntimeProfile, type ReadOnlyRestorationProof } from './runtime-profile.js';
import { reserveMadSksSqlPlaneOperation, transitionMadSksSqlPlaneOperation, type MadSksSqlPlaneOperationV2 } from './operation-store.js';
import { readBackCheck, runReadBackChecks, type MadSksSqlPlaneReadBackProof } from './postconditions.js';
import { madSksSqlPlaneOperationClassesFromClassification } from './policy.js';
import { projectRootHash, resolveMadSksSqlPlaneTarget, type MadSksSqlPlaneTarget } from './target.js';
import { classifySql } from '../../db-safety.js';
import {
  MAD_SKS_SQL_PLANE_CAPABILITY_FILE,
  MAD_SKS_SQL_PLANE_RESULT_FILE,
  madSksSqlPlaneDir,
  madSksSqlPlaneRelativePath,
  madSksSqlPlaneRuntimeDir
} from './paths.js';

export interface MadSksSqlPlanePreparedMission {
  schema: 'sks.mad-sks-sql-plane-prepared-mission.v1';
  ok: boolean;
  mission_id: string;
  cycle_id: string;
  target: MadSksSqlPlaneTarget;
  capability: MadSksSqlPlaneCapabilityV2;
  runtime_profile: Omit<MadSksSqlPlaneRuntimeProfile, 'server_url'>;
  tool_inventory: MadSksSqlPlaneToolInventory | null;
  blockers: string[];
}

export interface MadSksSqlPlaneCycleResult {
  schema: 'sks.mad-sks-sql-plane-cycle-result.v1';
  ok: boolean;
  mission_id: string;
  cycle_id: string;
  action: 'exec' | 'apply-migration' | 'run';
  target: MadSksSqlPlaneTarget;
  tool_inventory: MadSksSqlPlaneToolInventory | null;
  execution: MadSksSqlPlaneToolResult | null;
  operation: MadSksSqlPlaneOperationV2 | null;
  read_back: MadSksSqlPlaneReadBackProof | null;
  read_only_restoration: ReadOnlyRestorationProof;
  capability_closed: boolean;
  timings_ms: Record<string, number>;
  blockers: string[];
}

export async function prepareMadSksSqlPlaneMission(input: {
  root: string;
  task: string;
  args?: string[];
  ttlMs?: number | undefined;
  verifyTools?: boolean;
  runtimeSessionId?: string;
  sessionKey?: string;
  missionId?: string | null;
  route?: 'MadSKS';
  routeCommand?: '$MAD-SKS';
}): Promise<MadSksSqlPlanePreparedMission> {
  const target = await resolveMadSksSqlPlaneTarget(input.root, { args: input.args || [] });
  const route = 'MadSKS';
  const routeCommand = '$MAD-SKS';
  const existingMissionId = input.missionId ? String(input.missionId) : '';
  const created = existingMissionId
    ? { id: existingMissionId, dir: missionDir(input.root, existingMissionId) }
    : await createMission(input.root, { mode: 'mad-sks', prompt: input.task || 'MAD-SKS SQL-plane execution', sessionKey: input.sessionKey });
  const { id, dir } = created;
  await ensureDir(dir);
  const runtimeDir = madSksSqlPlaneRuntimeDir(input.root, id);
  const cycleId = `mad-sks-sql-plane-${Date.now().toString(36)}`;
  const runtimeSessionId = input.runtimeSessionId || `mad-sks-sql-plane-session-${Date.now().toString(36)}`;
  const blockers = [...target.blockers];
  let profile: MadSksSqlPlaneRuntimeProfile;
  if (!target.project_ref) {
    profile = await createMadSksSqlPlaneRuntimeProfile({ root: input.root, missionId: id, cycleId, projectRef: 'missing-project-ref', runtimeSessionId, mcpUrl: target.mcp_url });
  } else {
    profile = await createMadSksSqlPlaneRuntimeProfile({ root: input.root, missionId: id, cycleId, projectRef: target.project_ref, runtimeSessionId, mcpUrl: target.mcp_url });
  }
  const capability = await createMadSksSqlPlaneCapability(input.root, {
    missionId: id,
    ack: MAD_SKS_SQL_PLANE_ACK,
    cwd: input.root,
    cycleId,
    projectRef: target.project_ref || 'missing-project-ref',
    targetEnvironment: target.target_environment,
    allowedSchemas: target.allowed_schemas,
    ttlMs: input.ttlMs,
    runtimeSessionId,
    operatorIntent: input.task,
    profilePath: profile.profile_path,
    profileSha256: profile.profile_sha256,
    serverUrlRedacted: profile.server_url_redacted,
    operations: [...madSksSqlPlaneOperationClassesFromClassification(classifySql(input.task))],
    status: blockers.length ? 'quarantined' : 'transport_ready'
  });
  let toolInventory: MadSksSqlPlaneToolInventory | null = null;
  if (input.verifyTools && !blockers.length) {
    const executor = new MadSksSqlPlaneMcpExecutor(profile);
    toolInventory = await executor.inventory();
    await executor.close();
    await writeJsonAtomic(path.join(runtimeDir, 'tool-inventory.json'), toolInventory);
    if (!toolInventory.ok) blockers.push('mad_sks_sql_plane_execute_sql_or_apply_migration_unavailable');
    else await markMadSksSqlPlaneTransportReady(input.root, id);
  }
  await writeJsonAtomic(path.join(dir, 'route-context.json'), {
    route,
    command: routeCommand,
    mode: 'MADSKS',
    task: input.task,
    target: redactTarget(target),
    capability_file: madSksSqlPlaneRelativePath(MAD_SKS_SQL_PLANE_CAPABILITY_FILE),
    runtime_profile_manifest: madSksSqlPlaneRelativePath('runtime', 'runtime-profile-manifest.json'),
    tool_inventory: toolInventory ? madSksSqlPlaneRelativePath('runtime', 'tool-inventory.json') : null,
    sql_plane_executor: true
  });
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), {
    schema: 'sks.mad-sks-gate.v1',
    passed: false,
    mad_sks_permission_active: !blockers.length,
    permissions_deactivated: false,
    sql_plane: {
      requested: true,
      capability_id: preparedCapabilityId(id, cycleId),
      operation_classes: [...madSksSqlPlaneOperationClassesFromClassification(classifySql(input.task))],
      read_back_passed: false,
      profile_closed: false
    },
    mad_sks_sql_plane_capability_active: !blockers.length,
    sql_plane_all_mutations_allowed: !blockers.length,
    control_plane_denied: true,
    mission_id: id,
    cycle_id: cycleId,
    blockers,
    created_at: nowIso()
  });
  await setCurrent(input.root, {
    mission_id: id,
    mad_sks_sql_plane_capability_mission_id: id,
    route,
    route_command: routeCommand,
    mode: 'MADSKS',
    phase: blockers.length ? `${route.toUpperCase()}_BLOCKED` : `${route.toUpperCase()}_SQL_PLANE_CAPABILITY_ACTIVE`,
    questions_allowed: false,
    implementation_allowed: !blockers.length,
    mad_sks_sql_plane_active: !blockers.length,
    mad_sks_active: route === 'MadSKS' && !blockers.length,
    mad_sks_sql_plane_cycle_id: cycleId,
    mad_sks_sql_plane_runtime_session_id: runtimeSessionId,
    mad_sks_sql_plane_profile_sha256: profile.profile_sha256,
    mad_sks_sql_plane_capability_file: madSksSqlPlaneRelativePath(MAD_SKS_SQL_PLANE_CAPABILITY_FILE),
    mad_sks_gate_file: 'mad-sks-gate.json',
    stop_gate: 'mad-sks-gate.json',
    prompt: input.task
  }, { sessionKey: input.sessionKey });
  return {
    schema: 'sks.mad-sks-sql-plane-prepared-mission.v1',
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

export async function runMadSksSqlPlaneCycle(input: {
  root: string;
  action: 'exec' | 'apply-migration' | 'run';
  task: string;
  sql?: string | null;
  migrationName?: string | null;
  migrationFile?: string | null;
  verifySql?: string | null;
  verifyExpectedRowCount?: number | null;
  verifyExpectedResultDigest?: string | null;
  ttlMs?: number | undefined;
  args?: string[];
  missionId?: string | null;
  route?: 'MadSKS';
  routeCommand?: '$MAD-SKS';
}): Promise<MadSksSqlPlaneCycleResult> {
  const timings: Record<string, number> = {};
  const start = Date.now();
  const prepareInput: Parameters<typeof prepareMadSksSqlPlaneMission>[0] = {
    root: input.root,
    task: input.task,
    args: input.args || [],
    ttlMs: input.ttlMs,
    verifyTools: false,
    missionId: input.missionId || null
  };
  if (input.route) prepareInput.route = input.route;
  if (input.routeCommand) prepareInput.routeCommand = input.routeCommand;
  const prepared = await prepareMadSksSqlPlaneMission(prepareInput);
  timings.prepare_ms = Date.now() - start;
  const profile = await recreateProfileFromPrepared(input.root, prepared);
  const executor = new MadSksSqlPlaneMcpExecutor(profile);
  let inventory: MadSksSqlPlaneToolInventory | null = null;
  let execution: MadSksSqlPlaneToolResult | null = null;
  let operation: MadSksSqlPlaneOperationV2 | null = null;
  let readBack: MadSksSqlPlaneReadBackProof | null = null;
  const blockers = [...prepared.blockers];
  try {
    const connectStart = Date.now();
    inventory = await executor.inventory();
    timings.mcp_connect_ms = Date.now() - connectStart;
    await writeJsonAtomic(path.join(madSksSqlPlaneRuntimeDir(input.root, prepared.mission_id), 'tool-inventory.json'), inventory);
    if (!inventory.ok) {
      blockers.push('mad_sks_sql_plane_execute_sql_or_apply_migration_unavailable');
      if (inventory.error_kind) blockers.push(inventory.error_kind);
      throw new Error('mad_sks_sql_plane_tool_inventory_failed');
    }
    await activateMadSksSqlPlaneCapability(input.root, prepared.mission_id);
    const sql = await resolveSqlInput(input);
    if (!sql) {
      blockers.push('mad_sks_sql_plane_sql_missing_for_execution');
      throw new Error('mad_sks_sql_plane_sql_missing_for_execution');
    }
    const classification = classifySql(sql);
    const toolName = input.action === 'apply-migration' ? 'apply_migration' : 'execute_sql';
    const toolCallId = `cli-${input.action}-${sha256(`${prepared.mission_id}:${sql}:${Date.now()}`).slice(0, 16)}`;
    const reservation = await reserveMadSksSqlPlaneOperation({
      root: input.root,
      missionId: prepared.mission_id,
      capability: prepared.capability,
      toolCallId,
      toolName,
      sql,
      migrationName: input.migrationName || null,
      operationClasses: madSksSqlPlaneOperationClassesFromClassification({ ...classification, toolName })
    });
    await transitionMadSksSqlPlaneOperation({ root: input.root, missionId: prepared.mission_id, toolCallId, state: 'started' });
    const execStart = Date.now();
    execution = input.action === 'apply-migration'
      ? await executor.applyMigration(input.migrationName || `mad_sks_sql_plane_${Date.now()}`, sql)
      : await executor.executeSql(sql);
    timings.execution_ms = Date.now() - execStart;
    operation = await transitionMadSksSqlPlaneOperation({
      root: input.root,
      missionId: prepared.mission_id,
      toolCallId,
      state: execution.ok ? 'succeeded' : 'failed',
      result: execution
    });
    if (!execution.ok) blockers.push('mad_sks_sql_plane_tool_execution_failed');
    if (!execution.ok && execution.error_kind) blockers.push(execution.error_kind);
    if (execution.ok && input.verifySql) {
      const verifyStart = Date.now();
      readBack = await runReadBackChecks({
        root: input.root,
        missionId: prepared.mission_id,
        executor,
        checks: [readBackCheck('operator_verify_sql', input.verifySql, {
          expectedRowCount: input.verifyExpectedRowCount ?? null,
          expectedResultDigest: input.verifyExpectedResultDigest ?? null
        })]
      });
      timings.verification_ms = Date.now() - verifyStart;
      if (!readBack.ok) blockers.push('mad_sks_sql_plane_read_back_verification_failed');
      if (operation) {
        operation = await transitionMadSksSqlPlaneOperation({
          root: input.root,
          missionId: prepared.mission_id,
          toolCallId,
          state: readBack.ok ? 'verified' : 'verification_failed',
          verificationArtifact: readBack.proof_path || null
        }) || operation;
      }
    }
  } catch (err: unknown) {
    // Previously discarded whenever blockers was already non-empty (e.g. a
    // prior execution failure), silently hiding any *new* exception raised
    // during read-back verification (20차 P1-7) — always recorded now,
    // distinctly prefixed once there's already a domain-level blocker so it
    // isn't mistaken for one.
    const message = err instanceof Error ? err.message : String(err);
    blockers.push(blockers.length ? `mad_sks_sql_plane_cycle_exception:${message}` : message);
  } finally {
    await executor.close();
  }
  const closeStart = Date.now();
  const restoration = await closeMadSksSqlPlaneRuntimeProfile({ root: input.root, missionId: prepared.mission_id, profile, reason: 'mad_sks_sql_plane_cycle_finally' });
  await closeMadSksSqlPlaneCycle(input.root, prepared.mission_id, prepared.cycle_id, 'mad_sks_sql_plane_cycle_finally');
  timings.close_ms = Date.now() - closeStart;
  timings.total_ms = Date.now() - start;
  const result: MadSksSqlPlaneCycleResult = {
    schema: 'sks.mad-sks-sql-plane-cycle-result.v1',
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
  await writeJsonAtomic(path.join(madSksSqlPlaneDir(input.root, prepared.mission_id), MAD_SKS_SQL_PLANE_RESULT_FILE), redactCycleResult(result));
  await writeMadSksSqlPlaneGate(input.root, result);
  await clearMadSksSqlPlaneCurrentState(input.root, prepared.mission_id, result.ok, restoration);
  return result;
}

function preparedCapabilityId(missionId: string, cycleId: string) {
  return `${missionId}:${cycleId}`;
}

export async function writeMadSksSqlPlaneGate(root: string, result: MadSksSqlPlaneCycleResult) {
  const file = path.join(missionDir(root, result.mission_id), 'mad-sks-gate.json');
  const previous = await readJson<any>(file, {});
  const operationClasses = result.operation?.operation_classes || [];
  const blockers = [
    ...(Array.isArray(previous.blockers) ? previous.blockers : []),
    ...(result.blockers || [])
  ];
  const sqlPlane = {
    requested: true,
    capability_id: preparedCapabilityId(result.mission_id, result.cycle_id),
    operation_classes: operationClasses,
    read_back_passed: result.read_back ? result.read_back.ok === true : result.execution?.ok === true,
    profile_closed: result.capability_closed === true && result.read_only_restoration?.ok === true
  };
  const passed = result.ok === true && sqlPlane.read_back_passed === true && sqlPlane.profile_closed === true;
  const gate = {
    ...previous,
    schema: previous.schema || 'sks.mad-sks-gate.v1',
    schema_version: previous.schema_version || 1,
    passed,
    mad_sks_permission_active: false,
    permissions_deactivated: true,
    sql_plane: sqlPlane,
    mad_sks_sql_plane_capability_active: false,
    sql_plane_all_mutations_allowed: result.execution?.ok === true,
    control_plane_denied: true,
    mission_id: result.mission_id,
    cycle_id: result.cycle_id,
    read_only_restoration: result.read_only_restoration,
    blockers: passed ? [] : [...new Set(blockers.length ? blockers : ['mad_sks_sql_plane_not_passed'])],
    created_at: previous.created_at || nowIso(),
    updated_at: nowIso()
  };
  await writeJsonAtomic(file, gate);
  return gate;
}

async function clearMadSksSqlPlaneCurrentState(root: string, missionId: string, ok: boolean, restoration: ReadOnlyRestorationProof) {
  const currentPath = path.join(root, '.sneakoscope', 'state', 'current.json');
  const current = await readJson(currentPath, {});
  if (current.mission_id !== missionId && current.mad_sks_sql_plane_capability_mission_id !== missionId) return;
  await setCurrent(root, {
    phase: ok ? 'MADSKS_SQL_PLANE_CLOSED' : 'MADSKS_SQL_PLANE_FAILED_CLOSED',
    implementation_allowed: false,
    mad_sks_sql_plane_active: false,
    mad_sks_active: false,
    mad_sks_sql_plane_runtime_session_id: null,
    mad_sks_sql_plane_profile_sha256: null,
    mad_sks_sql_plane_read_only_restored: restoration.ok,
    mad_sks_sql_plane_closed_at: nowIso(),
    mad_sks_sql_plane_last_result_file: madSksSqlPlaneRelativePath(MAD_SKS_SQL_PLANE_RESULT_FILE)
  }, { sessionKey: current._session_key });
}

function redactCycleResult(result: MadSksSqlPlaneCycleResult): MadSksSqlPlaneCycleResult {
  return {
    ...result,
    target: redactTarget(result.target)
  };
}

async function resolveSqlInput(input: { action: string; task: string; sql?: string | null; migrationFile?: string | null }) {
  if (input.sql) return input.sql;
  if (input.migrationFile) return readText(path.resolve(input.migrationFile), '');
  const trimmed = String(input.task || '').trim();
  return /^(select|with|show|explain|describe|insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i.test(trimmed) ? trimmed : null;
}

async function recreateProfileFromPrepared(root: string, prepared: MadSksSqlPlanePreparedMission): Promise<MadSksSqlPlaneRuntimeProfile> {
  const projectRef = prepared.target.project_ref || 'missing-project-ref';
  return {
    schema: 'sks.mad-sks-sql-plane-runtime-profile.v1',
    mission_id: prepared.mission_id,
    cycle_id: prepared.cycle_id,
    runtime_session_id: prepared.capability.runtime_session_id,
    project_ref_hash: sha256(projectRef).slice(0, 16),
    profile_path: prepared.runtime_profile.profile_path,
    profile_sha256: prepared.runtime_profile.profile_sha256,
    server_url_redacted: prepared.runtime_profile.server_url_redacted,
    server_url: prepared.target.mcp_url || `https://mcp.supabase.com/mcp?project_ref=${encodeURIComponent(projectRef)}&features=database`,
    server_url_source: prepared.target.mcp_url ? 'explicit_mcp_url' : 'generated_project_ref',
    features: ['database'],
    write_capable: true,
    normal_config_hash_before: prepared.runtime_profile.normal_config_hash_before,
    created_at: prepared.runtime_profile.created_at
  };
}

function redactTarget(target: MadSksSqlPlaneTarget) {
  return {
    ...target,
    project_ref: target.project_ref ? `<hash:${target.project_ref_hash}>` : null,
    mcp_url: target.mcp_url ? '<redacted>' : null
  };
}

export async function madSksSqlPlaneRouteIdentityProof(root: string, missionId: string) {
  const capability = await readMadSksSqlPlaneCapability(root, missionId);
  const state = await readJson<any>(path.join(root, '.sneakoscope', 'state', 'current.json'), {});
  const profile = await readJson<any>(path.join(madSksSqlPlaneRuntimeDir(root, missionId), 'runtime-profile-manifest.json'), null);
  const sameMission = Boolean(capability && capability.mission_id === missionId && state?.mission_id === missionId);
  const currentMadSks = state?.route === 'MadSKS' && state?.route_command === '$MAD-SKS';
  return {
    schema: 'sks.mad-sks-sql-plane-route-identity-proof.v1',
    ok: sameMission && currentMadSks,
    mission_id: missionId,
    capability_mission_id: capability?.mission_id || null,
    same_mission: sameMission,
    route: state?.route || null,
    route_command: state?.route_command || null,
    current_route_accepted: currentMadSks,
    cycle_id: capability?.cycle_id || null,
    project_root_hash: await projectRootHash(root),
    runtime_profile: profile,
    blockers: [
      ...(capability ? [] : ['capability_missing']),
      ...(profile ? [] : ['runtime_profile_manifest_missing']),
      ...(sameMission ? [] : ['mission_binding_mismatch']),
      ...(currentMadSks ? [] : ['route_state_not_mad_sks']),
      ...(currentMadSks ? [] : ['route_command_not_mad_sks'])
    ]
  };
}
