#!/usr/bin/env node
// core-skill:promotion-side-effect-ledger (1.20.2 Area 3.3).
//
// Proves a skill snapshot promotion is recorded in the mutation ledger as a
// 'skill_snapshot_promotion' entry with a backup/rollback pointer and no scope
// violation — AND that the existing 2-arg promoteToDeployed signature still works
// (regression guard for the 3 existing callers).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const { createCandidateCard, routeSkillId } = await importDist('core/skills/core-skill-card.js');
const { promoteToDeployed } = await importDist('core/skills/core-skill-deployment.js');
const { createRequestedScopeContract } = await importDist('core/safety/requested-scope-contract.js');
const { mutationLedgerPath } = await importDist('core/safety/mutation-ledger.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-skill-promo-'));
const route = '$DFix';
const skillId = routeSkillId(route);
const contract = createRequestedScopeContract({
  route: 'skill-promotion', userRequest: 'deploy accepted skill', projectRoot: root,
  overrides: { skill_snapshot_promotion: true }
});

// First deploy (no previous snapshot → no backup, uses no_op reason).
const c1 = { ...createCandidateCard({ skillId, route, baseVersion: 0, body: 'v1 body' }), status: 'accepted' };
const p1 = await promoteToDeployed(root, c1, { contract, context: 'release' });
assertGate(p1.ok === true, 'first promotion must succeed', { p1 });

// Second deploy (higher version) → archives previous as the rollback pointer.
const c2 = { ...createCandidateCard({ skillId, route, baseVersion: 1, body: 'v2 body' }), status: 'accepted' };
const p2 = await promoteToDeployed(root, c2, { contract, context: 'release' });
assertGate(p2.ok === true, 'second promotion must succeed', { p2 });
assertGate(typeof p2.archived_path === 'string' && p2.archived_path.length > 0, 'second promotion must produce a rollback pointer (archived_path)', { p2 });

// Ledger must contain skill_snapshot_promotion entries, none in violation, the
// versioned one carrying the archived backup_path.
const ledgerText = fs.readFileSync(mutationLedgerPath(root), 'utf8');
const entries = ledgerText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const promotions = entries.filter((e) => e.kind === 'skill_snapshot_promotion');
assertGate(promotions.length >= 2, 'each promotion must be recorded in the mutation ledger', { count: promotions.length });
assertGate(promotions.every((e) => e.violation === false), 'in-scope confirmed promotions must not be violations', { promotions });
assertGate(promotions.some((e) => e.backup_path && /deployed-history/.test(String(e.backup_path))), 'a promotion entry must reference the archived rollback pointer', { promotions });

// Regression: 2-arg promoteToDeployed must still work and NOT record (no contract).
const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-skill-promo-2arg-'));
const c3 = { ...createCandidateCard({ skillId, route, baseVersion: 0, body: 'b' }), status: 'accepted' };
const p3 = await promoteToDeployed(fresh, c3);
assertGate(p3.ok === true && p3.snapshot !== null, '2-arg promoteToDeployed must still return ok', { p3 });
assertGate(!fs.existsSync(mutationLedgerPath(fresh)), '2-arg promotion (no contract) must not write a ledger', {});

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(fresh, { recursive: true, force: true });
emitGate('core-skill:promotion-side-effect-ledger', { promotions: promotions.length, rollback_pointer: true, two_arg_safe: true });
