import { type DoctorFixTransaction } from './doctor-transaction.js';

export function doctorRepairPostcheck(transaction: DoctorFixTransaction | null | undefined) {
  return {
    schema: 'sks.doctor-repair-postcheck.v1',
    ok: transaction?.postcheck_ok === true,
    transaction_ok: transaction?.ok === true,
    manual_required: (transaction?.phases || []).filter((phase) => phase.manual_required).map((phase) => phase.id),
    blockers: (transaction?.phases || []).flatMap((phase) => phase.blockers)
  };
}
