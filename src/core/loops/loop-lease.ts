import { loopOwnerLedgerPath } from './loop-artifacts.js';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import type { SksLoopNode, SksLoopOwnerScope } from './loop-schema.js';

export interface SksLoopLease {
  schema: 'sks.loop-lease.v1';
  mission_id: string;
  loop_id: string;
  owner_scope: SksLoopOwnerScope;
  acquired_at: string;
  expires_at: string;
  status: 'active' | 'released' | 'expired' | 'conflict';
  worktree_id: string | null;
  blockers: string[];
}

interface SksLoopOwnerLedger {
  schema: 'sks.loop-owner-ledger.v1';
  mission_id: string;
  updated_at: string;
  leases: SksLoopLease[];
}

export async function acquireLoopLease(root: string, plan: { mission_id: string }, node: SksLoopNode): Promise<SksLoopLease> {
  const blockers = await detectLoopLeaseConflicts(root, plan.mission_id, node);
  const lease: SksLoopLease = {
    schema: 'sks.loop-lease.v1',
    mission_id: plan.mission_id,
    loop_id: node.loop_id,
    owner_scope: node.owner_scope,
    acquired_at: nowIso(),
    expires_at: new Date(Date.now() + Math.max(60_000, node.budget.max_wall_ms)).toISOString(),
    status: blockers.length ? 'conflict' : 'active',
    worktree_id: node.worktree.required ? `sks-loop-${node.loop_id}` : null,
    blockers
  };
  const ledger = await readLoopOwnerLedger(root, plan.mission_id);
  const leases = ledger.leases.filter((row) => row.loop_id !== node.loop_id);
  leases.push(lease);
  await writeLoopOwnerLedger(root, plan.mission_id, leases);
  return lease;
}

export async function releaseLoopLease(root: string, missionId: string, loopId: string): Promise<void> {
  const ledger = await readLoopOwnerLedger(root, missionId);
  const leases = ledger.leases.map((lease) => lease.loop_id === loopId ? { ...lease, status: 'released' as const } : lease);
  await writeLoopOwnerLedger(root, missionId, leases);
}

export async function detectLoopLeaseConflicts(root: string, missionId: string, node: SksLoopNode): Promise<string[]> {
  const ledger = await readLoopOwnerLedger(root, missionId);
  const active = ledger.leases.filter((lease) => lease.status === 'active' && Date.parse(lease.expires_at) > Date.now());
  const blockers: string[] = [];
  for (const lease of active) {
    if (lease.loop_id === node.loop_id) continue;
    if (overlap(lease.owner_scope.files, node.owner_scope.files).length && (lease.owner_scope.exclusive || node.owner_scope.exclusive)) {
      blockers.push(`lease_file_conflict:${lease.loop_id}`);
    }
    if (overlap(lease.owner_scope.package_scripts, node.owner_scope.package_scripts).length) blockers.push(`lease_package_script_conflict:${lease.loop_id}`);
    if (node.owner_scope.files.includes('release-gates.v2.json') || lease.owner_scope.files.includes('release-gates.v2.json')) {
      blockers.push(`lease_release_gates_integration_only:${lease.loop_id}`);
    }
    const docsOnly = allDocs(lease.owner_scope) && allDocs(node.owner_scope);
    if (docsOnly) {
      for (let i = blockers.length - 1; i >= 0; i -= 1) {
        if (blockers[i]?.includes(lease.loop_id)) blockers.splice(i, 1);
      }
    }
  }
  return [...new Set(blockers)];
}

async function readLoopOwnerLedger(root: string, missionId: string): Promise<SksLoopOwnerLedger> {
  return readJson<SksLoopOwnerLedger>(loopOwnerLedgerPath(root, missionId), {
    schema: 'sks.loop-owner-ledger.v1',
    mission_id: missionId,
    updated_at: nowIso(),
    leases: []
  });
}

async function writeLoopOwnerLedger(root: string, missionId: string, leases: SksLoopLease[]): Promise<void> {
  await writeJsonAtomic(loopOwnerLedgerPath(root, missionId), {
    schema: 'sks.loop-owner-ledger.v1',
    mission_id: missionId,
    updated_at: nowIso(),
    leases
  });
}

function overlap(a: string[], b: string[]): string[] {
  const rhs = new Set(b);
  return a.filter((value) => rhs.has(value));
}

function allDocs(scope: SksLoopOwnerScope): boolean {
  const values = [...scope.files, ...scope.directories];
  return values.length > 0 && values.every((value) => value === 'README.md' || value === 'CHANGELOG.md' || value.startsWith('docs'));
}
