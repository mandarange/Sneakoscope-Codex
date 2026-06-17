import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export interface DoctorFixTransactionPhase {
  id: string;
  ok: boolean;
  repaired?: boolean;
  manual_required?: boolean;
  required_for_ready?: boolean;
  blockers?: string[];
  warnings?: string[];
  artifact_path?: string | null;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  rollback_performed?: boolean;
}

export interface DoctorFixPhaseDefinition {
  id: string;
  required_for_ready?: boolean;
  run: () => Promise<DoctorFixTransactionPhase | void>;
  postcheck?: (phase: DoctorFixTransactionPhase) => Promise<Partial<DoctorFixTransactionPhase> | void>;
  rollback?: (phase: DoctorFixTransactionPhase) => Promise<void>;
}

export interface DoctorFixTransaction {
  schema: 'sks.doctor-fix-transaction.v1';
  ok: boolean;
  root: string;
  started_at: string;
  completed_at: string;
  phases: Array<{
    id: string;
    ok: boolean;
    repaired: boolean;
    manual_required: boolean;
    required_for_ready: boolean;
    blockers: string[];
    warnings: string[];
    artifact_path: string | null;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    rollback_performed: boolean;
  }>;
  postcheck_ok: boolean;
  rollback_performed: boolean;
  raw_secret_values_recorded: false;
}

export async function runDoctorFixTransaction(input: {
  root: string;
  phases: DoctorFixPhaseDefinition[];
  reportPath?: string | null;
}): Promise<DoctorFixTransaction> {
  const startedAt = nowIso();
  const phases: DoctorFixTransactionPhase[] = [];
  let rollbackPerformed = false;
  for (const definition of input.phases) {
    const phaseStarted = nowIso();
    const startedMs = Date.now();
    let phase: DoctorFixTransactionPhase = {
      id: definition.id,
      ok: false,
      repaired: false,
      manual_required: false,
      required_for_ready: definition.required_for_ready !== false,
      blockers: [],
      warnings: [],
      artifact_path: null,
      started_at: phaseStarted
    };
    try {
      const result = await definition.run();
      phase = normalizePhase(definition, result, phase, startedMs);
      if (definition.postcheck) {
        const postcheck = await definition.postcheck(phase);
        if (postcheck) phase = mergePhase(phase, postcheck);
      }
    } catch (err: unknown) {
      phase = normalizePhase(definition, {
        id: definition.id,
        ok: false,
        blockers: [messageOf(err)]
      }, phase, startedMs);
    }
    if (!phase.ok && definition.rollback) {
      try {
        await definition.rollback(phase);
        phase.rollback_performed = true;
        rollbackPerformed = true;
      } catch (err: unknown) {
        phase.rollback_performed = true;
        rollbackPerformed = true;
        phase.blockers = [...(phase.blockers || []), `rollback_failed:${messageOf(err)}`];
      }
    }
    phase.completed_at = phase.completed_at || nowIso();
    phase.duration_ms = phase.duration_ms ?? Math.max(0, Date.now() - startedMs);
    phases.push(phase);
  }
  const writeInput: {
    root: string;
    startedAt: string;
    phases: DoctorFixTransactionPhase[];
    rollbackPerformed: boolean;
    reportPath?: string | null;
  } = {
    root: input.root,
    startedAt,
    phases,
    rollbackPerformed
  };
  if (input.reportPath !== undefined) writeInput.reportPath = input.reportPath;
  return writeDoctorFixTransaction(writeInput);
}

export async function writeDoctorFixTransaction(input: {
  root: string;
  startedAt?: string;
  phases: DoctorFixTransactionPhase[];
  rollbackPerformed?: boolean;
  reportPath?: string | null;
}): Promise<DoctorFixTransaction> {
  const root = path.resolve(input.root);
  const phases = input.phases.map((phase) => ({
    id: phase.id,
    ok: phase.ok === true,
    repaired: phase.repaired === true,
    manual_required: phase.manual_required === true,
    required_for_ready: phase.required_for_ready !== false,
    blockers: phase.blockers || [],
    warnings: phase.warnings || [],
    artifact_path: phase.artifact_path || null,
    started_at: phase.started_at || null,
    completed_at: phase.completed_at || null,
    duration_ms: Number.isFinite(phase.duration_ms) ? Number(phase.duration_ms) : null,
    rollback_performed: phase.rollback_performed === true
  }));
  const postcheckOk = phases.every((phase) => phase.ok || (phase.manual_required && !phase.required_for_ready));
  const report: DoctorFixTransaction = {
    schema: 'sks.doctor-fix-transaction.v1',
    ok: postcheckOk,
    root,
    started_at: input.startedAt || nowIso(),
    completed_at: nowIso(),
    phases,
    postcheck_ok: postcheckOk,
    rollback_performed: input.rollbackPerformed === true,
    raw_secret_values_recorded: false
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-fix-transaction.json'), report).catch(() => undefined);
  return report;
}

function normalizePhase(
  definition: DoctorFixPhaseDefinition,
  result: DoctorFixTransactionPhase | void,
  fallback: DoctorFixTransactionPhase,
  startedMs: number
): DoctorFixTransactionPhase {
  const phase = result || fallback;
  return {
    id: phase.id || definition.id,
    ok: phase.ok === true,
    repaired: phase.repaired === true,
    manual_required: phase.manual_required === true,
    required_for_ready: phase.required_for_ready ?? definition.required_for_ready !== false,
    blockers: phase.blockers || [],
    warnings: phase.warnings || [],
    artifact_path: phase.artifact_path || null,
    started_at: phase.started_at || fallback.started_at || nowIso(),
    completed_at: phase.completed_at || nowIso(),
    duration_ms: phase.duration_ms ?? Math.max(0, Date.now() - startedMs),
    rollback_performed: phase.rollback_performed === true
  };
}

function mergePhase(phase: DoctorFixTransactionPhase, update: Partial<DoctorFixTransactionPhase>): DoctorFixTransactionPhase {
  return {
    ...phase,
    ...update,
    ok: phase.ok === true && update.ok !== false,
    repaired: phase.repaired === true || update.repaired === true,
    manual_required: phase.manual_required === true || update.manual_required === true,
    blockers: [...(phase.blockers || []), ...(update.blockers || [])],
    warnings: [...(phase.warnings || []), ...(update.warnings || [])]
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
