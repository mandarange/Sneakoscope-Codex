#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const permissionMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'permission-model.js')).href);
const authMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'authorization-manifest.js')).href);
const auditMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'audit-ledger.js')).href);
const rollbackMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'rollback-plan.js')).href);
const proofMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'proof-evidence.js')).href);
const permission = permissionMod.buildMadSksPermissionModel({ targetRoot: root, flags: permissionMod.parseMadSksFlags(['--mad-sks', '--allow-system']) });
const authorization = authMod.createMadSksAuthorizationManifest({ permission, userIntent: 'fixture' });
const ledger = auditMod.createMadSksAuditLedger({ targetRoot: root, actions: [auditMod.madSksAuditAction({ type: 'file_write', target: path.join(root, '.sneakoscope/tmp/file'), rollback_available: true })] });
const rollback = rollbackMod.createMadSksRollbackPlan({ targetRoot: root, fileRollbacks: [{ path: '.sneakoscope/tmp/file', previous_content_hash: 'abc' }] });
const proof = proofMod.createMadSksProofEvidence({
  authorizationManifestPath: 'mad-sks-authorization.json',
  auditLedgerPath: 'mad-sks-audit-ledger.json',
  rollbackPlanPath: 'mad-sks-rollback-plan.json',
  protectedCoreComparison: { ok: true },
  verification: [{ command: 'fixture', ok: true }]
});
const ok = authorization.schema === 'sks.mad-sks-authorization.v1'
  && ledger.schema === 'sks.mad-sks-audit-ledger.v1'
  && rollback.schema === 'sks.mad-sks-rollback-plan.v1'
  && proof.schema === 'sks.mad-sks-proof-evidence.v1'
  && proof.ok === true;
emit({ schema: 'sks.mad-sks-audit-proof-check.v1', ok, authorization, ledger, rollback, proof });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-audit-proof-check.v1', ok: false, blocker, detail }); process.exit(1); }
