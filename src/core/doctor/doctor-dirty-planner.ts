import fs from 'node:fs';
import path from 'node:path';

export const DOCTOR_DIRTY_PLAN_SCHEMA = 'sks.doctor-dirty-plan.v1';

export interface DoctorDirtyPlan {
  schema: typeof DOCTOR_DIRTY_PLAN_SCHEMA;
  root: string;
  phases: Array<{ id: string; status: 'dirty' | 'clean' | 'unknown'; reason: string }>;
  dirty_count: number;
  clean_count: number;
}

export function planDoctorDirtyRepair(root: string, phaseIds: string[]): DoctorDirtyPlan {
  const phases = phaseIds.map((id) => {
    const marker = markerPath(root, id);
    if (!fs.existsSync(marker)) return { id, status: 'dirty' as const, reason: 'no_clean_marker' };
    return { id, status: 'clean' as const, reason: 'clean_marker_present' };
  });
  return {
    schema: DOCTOR_DIRTY_PLAN_SCHEMA,
    root,
    phases,
    dirty_count: phases.filter((phase) => phase.status === 'dirty').length,
    clean_count: phases.filter((phase) => phase.status === 'clean').length
  };
}

export function markDoctorPhaseClean(root: string, id: string): void {
  const file = markerPath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${new Date().toISOString()}\n`);
}

export function isDoctorPhaseClean(plan: DoctorDirtyPlan | null | undefined, id: string): boolean {
  return plan?.phases.find((phase) => phase.id === id)?.status === 'clean';
}

function markerPath(root: string, id: string): string {
  return path.join(root, '.sneakoscope', 'cache', 'doctor-dirty', `${id.replace(/[^a-zA-Z0-9._-]+/g, '_')}.clean`);
}
