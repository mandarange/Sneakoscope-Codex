import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export interface DoctorFixTransactionPhase {
  id: string;
  ok: boolean;
  repaired?: boolean;
  manual_required?: boolean;
  blockers?: string[];
  warnings?: string[];
  artifact_path?: string | null;
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
    blockers: string[];
    warnings: string[];
    artifact_path: string | null;
  }>;
  postcheck_ok: boolean;
  rollback_performed: boolean;
  raw_secret_values_recorded: false;
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
    blockers: phase.blockers || [],
    warnings: phase.warnings || [],
    artifact_path: phase.artifact_path || null
  }));
  const postcheckOk = phases.every((phase) => phase.ok || phase.manual_required);
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
