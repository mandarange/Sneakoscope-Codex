import path from 'node:path';
import { adapterForDetection } from './adapter-registry.js';
import { auditGeo, auditSeo } from './analyzers.js';
import { detectProject, discoverSiteInventory } from './discovery.js';
import { applyMutationPlan, buildMutationPlan, rollbackMutationPlan } from './mutation.js';
import { createSearchVisibilityMission, resolveSearchVisibilityMission, routeForMode, type SearchVisibilityMission } from './mission.js';
import { finalizeSearchVisibility, statusForMission, writeAuditArtifacts, writeGate } from './artifacts.js';
import { verifySearchVisibility } from './verifier.js';
import { projectRoot, readJson, writeJsonAtomic, type JsonData } from '../fsx.js';
import type { EntityFacts, ProjectContext, SearchVisibilityCliOptions, SearchVisibilityMode, SiteInventory } from './types.js';

export * from './types.js';
export { createSearchVisibilityMission, resolveSearchVisibilityMission } from './mission.js';

export async function runSearchVisibilityAudit(mode: SearchVisibilityMode, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const root = await projectRoot(options.root);
  const ctx = context(mode, root, options);
  const mission = await createSearchVisibilityMission(mode, `${mode} audit`, options);
  const detected = await detectProject(ctx);
  const adapter = adapterForDetection(detected);
  const inventory = await adapter.discover(ctx, detected);
  if (mode === 'geo') {
    const geo = await auditGeo(root, inventory);
    const result = await writeAuditArtifacts(ctx, mission, inventory, geo.findings, {
      entityFacts: geo.entityFacts,
      claims: geo.claims,
      crawlers: geo.crawlers,
      answerability: geo.answerability,
    });
    return {
      schema: 'sks.search-visibility.audit-command.v1',
      ok: result.gate.ok,
      mission_id: mission.id,
      route: routeForMode(mode),
      status: result.gate.status,
      artifacts_dir: `.sneakoscope/missions/${mission.id}/search-visibility`,
      findings: geo.findings.length,
      gate: result.gate,
      proof: `.sneakoscope/missions/${mission.id}/completion-proof.json`,
    };
  }
  const findings = await auditSeo(root, inventory);
  const result = await writeAuditArtifacts(ctx, mission, inventory, findings, null);
  return {
    schema: 'sks.search-visibility.audit-command.v1',
    ok: result.gate.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    status: result.gate.status,
    artifacts_dir: `.sneakoscope/missions/${mission.id}/search-visibility`,
    findings: findings.length,
    gate: result.gate,
    proof: `.sneakoscope/missions/${mission.id}/completion-proof.json`,
  };
}

export async function runSearchVisibilityPlan(mode: SearchVisibilityMode, missionRef: string | null, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const mission = await resolveOrAudit(mode, missionRef, options);
  const ctx = context(mode, mission.root, options);
  const inventory = await readJson<SiteInventory>(path.join(mission.artifactDir, 'site-inventory.json'));
  const findingsArtifact = await readJson(path.join(mission.artifactDir, mode === 'seo' ? 'seo-findings.json' : 'geo-findings.json'), {});
  const findings = Array.isArray(findingsArtifact.findings) ? findingsArtifact.findings : [];
  const entityFacts = mode === 'geo'
    ? await readJson(path.join(mission.artifactDir, 'entity-facts.json'), null) as EntityFacts | null
    : null;
  const plan = await buildMutationPlan(mode, mission.id, mission.artifactDir, inventory, findings, options, entityFacts);
  return {
    schema: 'sks.search-visibility.plan-command.v1',
    ok: plan.status !== 'blocked',
    mission_id: mission.id,
    route: routeForMode(mode),
    status: plan.status,
    operations: plan.operations.length,
    blockers: plan.blockers,
    mutation_plan: `search-visibility/mutation-plan.json`,
  };
}

export async function runSearchVisibilityApply(mode: SearchVisibilityMode, missionRef: string | null, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const mission = await resolveOrAudit(mode, missionRef, options);
  const planPath = path.join(mission.artifactDir, 'mutation-plan.json');
  let plan = await readJson(planPath, null);
  if (!plan) {
    const planned = await runSearchVisibilityPlan(mode, mission.id, options);
    plan = await readJson(planPath, null);
    if (!planned.ok && !plan) return { schema: 'sks.search-visibility.apply-command.v1', ok: false, mission_id: mission.id, route: routeForMode(mode), status: 'blocked', blockers: ['mutation_plan_missing'] };
  }
  const applied = await applyMutationPlan(mission.root, mission.id, mission.artifactDir, plan, options);
  const verify = await runSearchVisibilityVerify(mode, mission.id, options);
  return {
    schema: 'sks.search-visibility.apply-command.v1',
    ok: applied.ok && verify.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    status: applied.status,
    applied: applied.applied,
    blockers: [...applied.blockers, ...((verify.blockers as string[] | undefined) || [])],
    rollback_manifest: 'search-visibility/rollback-manifest.json',
    verification: verify,
  };
}

export async function runSearchVisibilityVerify(mode: SearchVisibilityMode, missionRef: string | null, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const mission = await resolveOrAudit(mode, missionRef, options);
  const root = mission.root;
  const ctx = context(mode, root, options);
  const inventory = await readJson<SiteInventory>(path.join(mission.artifactDir, 'site-inventory.json'));
  const verification = await verifySearchVisibility(ctx, inventory, mission);
  await writeJsonAtomic(path.join(mission.artifactDir, 'verification-report.json'), verification);
  const findingsArtifact = await readJson(path.join(mission.artifactDir, mode === 'seo' ? 'seo-findings.json' : 'geo-findings.json'), {});
  const findings = Array.isArray(findingsArtifact.findings) ? findingsArtifact.findings : [];
  const gate = await writeGate(ctx, mission, findings, verification, mode === 'geo');
  await finalizeSearchVisibility(ctx, mission, gate, `sks ${mode} verify ${mission.id} --json`);
  return {
    schema: 'sks.search-visibility.verify-command.v1',
    ok: gate.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    status: gate.status,
    blockers: gate.blockers,
    unverified: gate.unverified,
    gate,
  };
}

export async function runSearchVisibilityStatus(mode: SearchVisibilityMode, missionRef: string | null, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const mission = await resolveSearchVisibilityMission(options.root, missionRef);
  if (!mission) return { schema: 'sks.search-visibility.status-command.v1', ok: false, status: 'missing_mission', route: routeForMode(mode) };
  return statusForMission(mission);
}

export async function runSearchVisibilityRollback(mode: SearchVisibilityMode, missionRef: string | null, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const mission = await resolveSearchVisibilityMission(options.root, missionRef);
  if (!mission) return { schema: 'sks.search-visibility.rollback-command.v1', ok: false, status: 'missing_mission', route: routeForMode(mode) };
  const result = await rollbackMutationPlan(mission.root, mission.artifactDir, options.apply);
  const verify = result.status === 'rolled_back' ? await runSearchVisibilityVerify(mode, mission.id, options) : null;
  return {
    schema: 'sks.search-visibility.rollback-command.v1',
    ok: result.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    status: result.status,
    rolled_back: result.rolled_back,
    blockers: result.blockers,
    verification: verify,
  };
}

export async function runSearchVisibilityDoctor(mode: SearchVisibilityMode, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const root = await projectRoot(options.root);
  const ctx = context(mode, root, options);
  const detected = await detectProject(ctx);
  return {
    schema: 'sks.search-visibility.doctor-command.v1',
    ok: detected.blockers.length === 0,
    route: routeForMode(mode),
    root,
    adapter: detected.adapterId,
    confidence: detected.confidence,
    capabilities: detected.capabilities,
    blockers: detected.blockers,
    status: detected.blockers.length ? 'blocked' : 'verified_partial',
  };
}

export async function runSearchVisibilityFixture(mode: SearchVisibilityMode, options: SearchVisibilityCliOptions): Promise<JsonData> {
  const root = await projectRoot(options.root);
  const result = await runSearchVisibilityAudit(mode, {
    ...options,
    root,
    target: mode === 'seo' ? 'package' : 'package',
    offline: true,
    strict: true,
  });
  const planned = await runSearchVisibilityPlan(mode, result.mission_id, options);
  return {
    schema: 'sks.search-visibility.fixture-command.v1',
    ok: Boolean(result.ok && planned.ok),
    mission_id: result.mission_id,
    route: routeForMode(mode),
    audit: result,
    plan: planned,
  };
}

function context(mode: SearchVisibilityMode, root: string, options: SearchVisibilityCliOptions): ProjectContext {
  return {
    root,
    mode,
    target: options.target,
    framework: options.framework,
    origin: options.url,
    offline: options.offline,
    strict: options.strict,
  };
}

async function resolveOrAudit(mode: SearchVisibilityMode, missionRef: string | null, options: SearchVisibilityCliOptions): Promise<SearchVisibilityMission> {
  const mission = await resolveSearchVisibilityMission(options.root, missionRef);
  if (mission) return mission;
  const audit = await runSearchVisibilityAudit(mode, options);
  const created = await resolveSearchVisibilityMission(options.root, audit.mission_id);
  if (!created) throw new Error('Search visibility audit did not create a mission');
  return created;
}
