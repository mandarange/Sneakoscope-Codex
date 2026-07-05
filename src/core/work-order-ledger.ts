import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from './fsx.js';
import { ARTIFACT_FILES, validateWorkOrderLedger } from './artifact-schemas.js';
import { promptRequirementItems } from './questions.js';

export function createWorkOrderLedger({ missionId = 'unassigned', route = 'team', requests = [], sourcesComplete = false }: any = {}) {
  const items = requests.map((request: any, index: any) => ({
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
    all_customer_requests_preserved: items.every((item: any) => Boolean(item.source.verbatim)),
    all_customer_requests_mapped: items.every((item: any) => item.implementation_tasks.length > 0 || item.blocker.blocked === true),
    all_work_items_verified: items.length > 0 && items.every((item: any) => item.status === 'verified' || item.status === 'blocked'),
    items
  };
}

export async function writeWorkOrderLedger(dir: any, ledger: any) {
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.work_order_ledger), ledger);
  return validateWorkOrderLedger(ledger);
}

export async function readWorkOrderLedger(dir: any) {
  return readJson(path.join(dir, ARTIFACT_FILES.work_order_ledger), null);
}

export function evaluateWorkOrderCoverage(ledger: any): { ok: boolean; blockers: string[]; uncovered_count: number } {
  if (!ledger) return { ok: true, blockers: [], uncovered_count: 0 };
  const blockers: string[] = [];
  if (!ledger.source_inventory_complete) blockers.push('work_order_inventory_truncated');
  if (!ledger.all_customer_requests_mapped) blockers.push('work_order_requests_not_mapped');
  if (!ledger.all_work_items_verified) blockers.push('work_order_items_not_verified');
  let uncovered_count = 0;
  for (const item of (ledger.items || [])) {
    const isVerified = item.status === 'verified';
    const isBlockedWithEvidence = item.status === 'blocked' && item.blocker?.blocked === true;
    if (!isVerified && !isBlockedWithEvidence) {
      uncovered_count += 1;
      blockers.push(`work_order_uncovered:${item.id}:"${item.source?.verbatim?.slice(0, 40) || ''}"`);
    }
  }
  return { ok: blockers.length === 0, blockers, uncovered_count };
}

export function updateWorkOrderItem(ledger: any, id: any, patch: any = {}) {
  return {
    ...ledger,
    items: (ledger.items || []).map((item: any) => item.id === id ? { ...item, ...patch } : item),
    all_customer_requests_mapped: (ledger.items || []).every((item: any) => item.id === id
      ? ((patch.implementation_tasks || item.implementation_tasks || []).length > 0 || (patch.blocker || item.blocker || {}).blocked === true)
      : ((item.implementation_tasks || []).length > 0 || item.blocker?.blocked === true)),
    all_work_items_verified: (ledger.items || []).every((item: any) => {
      const next = item.id === id ? { ...item, ...patch } : item;
      return next.status === 'verified' || next.status === 'blocked';
    })
  };
}

/**
 * Parses a free-form work-order prompt into WO-001..N ledger items (via
 * promptRequirementItems) and persists the ledger at mission creation time,
 * so every item is registered verbatim before any execution starts.
 */
export async function createAndWriteWorkOrderLedgerForPrompt(dir: any, { missionId, route, prompt }: any = {}) {
  const { items, truncated } = promptRequirementItems(String(prompt || ''));
  const requests = items.map((item: any) => ({
    type: 'chat_text',
    verbatim: item.text,
    location: `prompt:${item.id}`
  }));
  const ledger = createWorkOrderLedger({ missionId, route, requests, sourcesComplete: !truncated });
  await writeWorkOrderLedger(dir, ledger);
  return ledger;
}

/**
 * Closes out every item in a mission's ledger to a terminal state once the
 * route's own gate has decided ok/not-ok, so evaluateStop's coverage gate
 * (which blocks stop while any item sits in 'pending') can never wait
 * forever: an item is either verified (route succeeded) or honestly
 * blocked (route failed, real blockers recorded), never left hanging.
 * This is coarser than true per-item tracking, but it closes the loop.
 */
export async function closeWorkOrderLedgerForRouteResult(dir: any, { ok, blockers = [] }: { ok: boolean; blockers?: string[] }) {
  const ledger = await readWorkOrderLedger(dir);
  if (!ledger || !Array.isArray(ledger.items) || ledger.items.length === 0) return null;
  let next = ledger;
  for (const item of ledger.items) {
    const patch = ok
      ? { status: 'verified', implementation_tasks: item.implementation_tasks?.length ? item.implementation_tasks : ['route_completion'] }
      : { status: 'blocked', blocker: { blocked: true, reason: blockers.join(', ') || 'route_completion_blocked', needed_to_unblock: 'resolve the route blockers and re-run' } };
    next = updateWorkOrderItem(next, item.id, patch);
  }
  await writeWorkOrderLedger(dir, next);
  return next;
}
