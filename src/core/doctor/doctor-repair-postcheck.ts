import { type DoctorFixTransaction } from './doctor-transaction.js';

export function doctorRepairPostcheck(transaction: DoctorFixTransaction | null | undefined) {
  const phases = transaction?.phases || [];
  const requiredBlockers = phases
    .filter((phase) => phase.required_for_ready !== false && phase.ok !== true)
    .flatMap((phase) => phase.blockers.length ? phase.blockers : [`required_phase_not_ready:${phase.id}`]);
  const optionalWarnings = phases
    .filter((phase) => phase.required_for_ready === false && phase.ok !== true)
    .flatMap((phase) => phase.blockers.length ? phase.blockers.map((blocker) => `optional:${blocker}`) : [`optional_phase_not_ready:${phase.id}`]);
  const routeBlockers = Object.fromEntries(phases
    .flatMap((phase) => Object.entries((phase as any).route_blockers || {}))
    .map(([scope, blockers]) => [scope, Array.isArray(blockers) ? blockers.map(String) : []]));
  return {
    schema: 'sks.doctor-repair-postcheck.v2',
    ok: transaction?.postcheck_ok === true && requiredBlockers.length === 0 && Number(transaction?.mutations_without_rollback || 0) === 0,
    transaction_ok: transaction?.ok === true,
    required_ready: requiredBlockers.length === 0,
    mutations_without_rollback: Number(transaction?.mutations_without_rollback || 0),
    manual_required: phases.filter((phase) => phase.manual_required).map((phase) => phase.id),
    optional_manual_required: phases.filter((phase) => phase.manual_required && phase.required_for_ready === false).map((phase) => phase.id),
    required_blockers: [...new Set(requiredBlockers)],
    optional_warnings: [...new Set(optionalWarnings)],
    route_blockers: routeBlockers,
    blockers: [...new Set(requiredBlockers)]
  };
}
