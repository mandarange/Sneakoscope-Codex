import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from './fsx.mjs';
import { ARTIFACT_FILES, validateWorkOrderLedger } from './artifact-schemas.mjs';

export function createWorkOrderLedger({ missionId = 'unassigned', route = 'team', requests = [], sourcesComplete = false } = {}) {
  const items = requests.map((request, index) => ({
    id: `WO-${String(index + 1).padStart(3, '0')}`,
    source: {
      type: request.type || 'chat_text',
      verbatim: String(request.verbatim || request.text || '').trim(),
      location: request.location || `request:${index + 1}`
    },
    normalized_requirement: String(request.normalized_requirement || request.text || request.verbatim || '').trim(),
    acceptance_criteria: request.acceptance_criteria || [],
    implementation_tasks: request.implementation_tasks || [],
    owner: request.owner || 'parent_orchestrator',
    status: request.status || 'pending',
    implementation_evidence: request.implementation_evidence || [],
    verification_evidence: request.verification_evidence || [],
    unresolved_risks: request.unresolved_risks || [],
    blocker: request.blocker || { blocked: false, reason: null, needed_to_unblock: null }
  }));
  return {
    schema_version: 1,
    mission_id: missionId,
    route,
    created_at: nowIso(),
    source_inventory_complete: Boolean(sourcesComplete),
    all_customer_requests_preserved: items.every((item) => Boolean(item.source.verbatim)),
    all_customer_requests_mapped: items.every((item) => item.implementation_tasks.length > 0 || item.blocker.blocked === true),
    all_work_items_verified: items.length > 0 && items.every((item) => item.status === 'verified' || item.status === 'blocked'),
    items
  };
}

export async function writeWorkOrderLedger(dir, ledger) {
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.work_order_ledger), ledger);
  return validateWorkOrderLedger(ledger);
}

export async function readWorkOrderLedger(dir) {
  return readJson(path.join(dir, ARTIFACT_FILES.work_order_ledger), null);
}

export function updateWorkOrderItem(ledger, id, patch = {}) {
  return {
    ...ledger,
    items: (ledger.items || []).map((item) => item.id === id ? { ...item, ...patch } : item),
    all_customer_requests_mapped: (ledger.items || []).every((item) => item.id === id
      ? ((patch.implementation_tasks || item.implementation_tasks || []).length > 0 || (patch.blocker || item.blocker || {}).blocked === true)
      : ((item.implementation_tasks || []).length > 0 || item.blocker?.blocked === true)),
    all_work_items_verified: (ledger.items || []).every((item) => {
      const next = item.id === id ? { ...item, ...patch } : item;
      return next.status === 'verified' || next.status === 'blocked';
    })
  };
}
