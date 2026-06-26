import path from 'node:path';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { PACKAGE_VERSION, exists, readJson, writeJsonAtomic, type JsonData } from '../fsx.js';
import {
  buildAiCrawlerPolicy,
  buildCanonicalMap,
  buildInternalLinkGraph,
  buildLlmsTxtPlan,
  buildLocaleGraph,
  buildRobotsPolicy,
  buildRouteGraph,
  buildSitemapAudit,
  buildStructuredDataLedger,
} from './analyzers.js';
import { findingsFileForMode, gateFileForMode, missionRel, routeForMode, type SearchVisibilityMission } from './mission.js';
import { verifySearchVisibility } from './verifier.js';
import type {
  ClaimEvidence,
  CrawlerPolicySource,
  EntityFacts,
  Finding,
  ProjectContext,
  SearchVisibilityGate,
  SiteInventory,
  VerificationResult,
} from './types.js';

const COMMON_ARTIFACTS = [
  'intake.json',
  'adapter-detection.json',
  'site-inventory.json',
  'route-graph.json',
  'robots-policy.json',
  'structured-data-ledger.json',
  'verification-report.json',
];

export interface GeoArtifactsInput {
  entityFacts: EntityFacts;
  claims: ClaimEvidence[];
  crawlers: CrawlerPolicySource[];
  answerability: JsonData;
}

export async function writeAuditArtifacts(
  ctx: ProjectContext,
  mission: SearchVisibilityMission,
  inventory: SiteInventory,
  findings: Finding[],
  geo: GeoArtifactsInput | null
): Promise<{ verification: VerificationResult; gate: SearchVisibilityGate; proof: JsonData }> {
  const route = routeForMode(ctx.mode);
  await writeJsonAtomic(path.join(mission.artifactDir, 'adapter-detection.json'), withMeta(ctx, mission, {
    schema: 'sks.search-visibility.adapter-detection.v1',
    ...inventory.detected_adapter,
  }));
  await writeJsonAtomic(path.join(mission.artifactDir, 'site-inventory.json'), withMeta(ctx, mission, inventory));
  await writeJsonAtomic(path.join(mission.artifactDir, 'route-graph.json'), withMeta(ctx, mission, buildRouteGraph(inventory)));
  await writeJsonAtomic(path.join(mission.artifactDir, findingsFileForMode(ctx.mode)), withMeta(ctx, mission, {
    schema: `sks.search-visibility.${ctx.mode}-findings.v1`,
    findings,
    counts: countFindings(findings),
  }));
  await writeJsonAtomic(path.join(mission.artifactDir, 'canonical-map.json'), withMeta(ctx, mission, buildCanonicalMap(inventory)));
  await writeJsonAtomic(path.join(mission.artifactDir, 'locale-graph.json'), withMeta(ctx, mission, buildLocaleGraph(inventory)));
  await writeJsonAtomic(path.join(mission.artifactDir, 'sitemap-audit.json'), withMeta(ctx, mission, buildSitemapAudit(inventory)));
  await writeJsonAtomic(path.join(mission.artifactDir, 'robots-policy.json'), withMeta(ctx, mission, buildRobotsPolicy(inventory, geo?.crawlers)));
  await writeJsonAtomic(path.join(mission.artifactDir, 'structured-data-ledger.json'), withMeta(ctx, mission, buildStructuredDataLedger(inventory)));
  await writeJsonAtomic(path.join(mission.artifactDir, 'internal-link-graph.json'), withMeta(ctx, mission, buildInternalLinkGraph(inventory)));
  if (geo) {
    await writeJsonAtomic(path.join(mission.artifactDir, 'entity-facts.json'), withMeta(ctx, mission, geo.entityFacts));
    await writeJsonAtomic(path.join(mission.artifactDir, 'claim-evidence-ledger.json'), withMeta(ctx, mission, {
      schema: 'sks.search-visibility.claim-evidence-ledger.v1',
      claims: geo.claims,
    }));
    await writeJsonAtomic(path.join(mission.artifactDir, 'answerability-report.json'), withMeta(ctx, mission, geo.answerability));
    await writeJsonAtomic(path.join(mission.artifactDir, 'ai-crawler-policy.json'), withMeta(ctx, mission, buildAiCrawlerPolicy()));
    await writeJsonAtomic(path.join(mission.artifactDir, 'llms-txt-plan.json'), withMeta(ctx, mission, buildLlmsTxtPlan(inventory, geo.entityFacts)));
  }
  const verification = await verifySearchVisibility(ctx, inventory, mission);
  await writeJsonAtomic(path.join(mission.artifactDir, 'verification-report.json'), withMeta(ctx, mission, verification));
  const gate = await writeGate(ctx, mission, findings, verification, Boolean(geo));
  const proof = await finalizeSearchVisibility(ctx, mission, gate);
  return { verification, gate, proof };
}

export async function writeGate(
  ctx: ProjectContext,
  mission: SearchVisibilityMission,
  findings: Finding[],
  verification: VerificationResult,
  includeGeoArtifacts: boolean
): Promise<SearchVisibilityGate> {
  const route = routeForMode(ctx.mode);
  const gateFile = gateFileForMode(ctx.mode);
  const required = requiredArtifacts(ctx.mode, includeGeoArtifacts);
  const requiredStatus = await Promise.all(required.map(async (artifact) => {
    if (artifact === gateFile) return { path: gateFile, present: true };
    if (artifact === 'completion-proof.json') return { path: artifact, present: true };
    const file = artifact === gateFile || artifact === 'completion-proof.json'
      ? path.join(mission.dir, artifact)
      : path.join(mission.artifactDir, artifact);
    return { path: artifact === 'completion-proof.json' ? artifact : artifact === gateFile ? gateFile : `search-visibility/${artifact}`, present: await exists(file) };
  }));
  const unsupportedClaims = findings
    .filter((finding) => finding.severity === 'critical' && /guarantee|ranking|traffic|citation|unsupported/i.test(finding.summary))
    .map((finding) => finding.id);
  const artifactBlockers = requiredStatus.filter((item) => !item.present && item.path !== 'completion-proof.json').map((item) => `missing:${item.path}`);
  const findingBlockers = findings.filter((finding) => finding.blocking && !/unsupported ranking|Unsupported ranking/i.test(finding.summary)).map((finding) => finding.id);
  const blockers = [...artifactBlockers, ...verification.blockers, ...findingBlockers];
  const unverified = Array.from(new Set([
    ...verification.unverified,
    'production URL, browser rendering, Search Console, analytics, ranking, traffic, and AI citation outcomes are not claimed without direct evidence',
  ]));
  const ok = blockers.length === 0 && unsupportedClaims.length === 0;
  const gate: SearchVisibilityGate = {
    schema: 'sks.search-visibility.gate.v1',
    generated_at: new Date().toISOString(),
    mission_id: mission.id,
    route,
    ok,
    passed: ok,
    status: ok ? 'verified_partial' : 'blocked',
    command_identity: route === '$SEO-GEO-OPTIMIZER',
    required_artifacts: requiredStatus,
    unsupported_claims: unsupportedClaims,
    blockers,
    unverified,
    completion_proof: `.sneakoscope/missions/${mission.id}/completion-proof.json`,
  };
  await writeJsonAtomic(path.join(mission.dir, gateFile), gate);
  return gate;
}

export async function finalizeSearchVisibility(
  ctx: ProjectContext,
  mission: SearchVisibilityMission,
  gate: SearchVisibilityGate,
  command = `sks ${ctx.mode} audit --json`
): Promise<JsonData> {
  const route = routeForMode(ctx.mode);
  const artifacts = [
    ...requiredArtifacts(ctx.mode, ctx.mode === 'geo').map((artifact) => artifact === gateFileForMode(ctx.mode) ? artifact : `search-visibility/${artifact}`),
    gateFileForMode(ctx.mode),
    'completion-proof.json',
  ];
  return maybeFinalizeRoute(mission.root, {
    missionId: mission.id,
    route,
    gateFile: gateFileForMode(ctx.mode),
    gate,
    artifacts,
    statusHint: gate.ok ? 'verified_partial' : 'blocked',
    blockers: gate.blockers,
    unverified: gate.unverified,
    command: { cmd: command, status: gate.ok ? 0 : 1 },
    agents: false,
    lightweightEvidence: true,
  });
}

export function requiredArtifacts(mode: 'seo' | 'geo', includeGeoArtifacts = mode === 'geo'): string[] {
  const seo = [
    ...COMMON_ARTIFACTS,
    'seo-findings.json',
    'canonical-map.json',
    'locale-graph.json',
    'sitemap-audit.json',
    'internal-link-graph.json',
    'seo-gate.json',
    'completion-proof.json',
  ];
  if (mode === 'seo') return seo;
  return [
    ...COMMON_ARTIFACTS,
    'geo-findings.json',
    'canonical-map.json',
    'locale-graph.json',
    'sitemap-audit.json',
    'internal-link-graph.json',
    ...(includeGeoArtifacts ? ['entity-facts.json', 'claim-evidence-ledger.json', 'answerability-report.json', 'ai-crawler-policy.json', 'llms-txt-plan.json'] : []),
    'geo-gate.json',
    'completion-proof.json',
  ];
}

export async function statusForMission(mission: SearchVisibilityMission): Promise<JsonData> {
  const seoGate = await readJson(path.join(mission.dir, 'seo-gate.json'), null);
  const geoGate = await readJson(path.join(mission.dir, 'geo-gate.json'), null);
  const verification = await readJson(path.join(mission.artifactDir, 'verification-report.json'), null);
  const plan = await readJson(path.join(mission.artifactDir, 'mutation-plan.json'), null);
  const proof = await readJson(path.join(mission.dir, 'completion-proof.json'), null);
  return {
    schema: 'sks.search-visibility.status.v1',
    ok: Boolean(seoGate?.ok || geoGate?.ok || verification),
    mission_id: mission.id,
    artifacts_dir: missionRel(mission.id, ''),
    gate: seoGate || geoGate,
    verification,
    mutation_plan: plan,
    completion_proof: proof ? `.sneakoscope/missions/${mission.id}/completion-proof.json` : null,
  };
}

function withMeta(ctx: ProjectContext, mission: SearchVisibilityMission, data: JsonData): JsonData {
  const value = data && typeof data === 'object' && !Array.isArray(data) ? data : { value: data };
  return {
    ...value,
    generated_at: value.generated_at || new Date().toISOString(),
    package_version: PACKAGE_VERSION,
    mission_id: mission.id,
    route: routeForMode(ctx.mode),
    root: mission.root,
    target: ctx.target,
    source_commit: null,
    input_hashes: {},
    tool_versions: { sneakoscope: PACKAGE_VERSION },
    network_used: Boolean(ctx.origin && !ctx.offline),
    browser_used: false,
    status: value.status || 'verified_partial',
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
    unverified: Array.isArray(value.unverified) ? value.unverified : [],
  };
}

function countFindings(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] || 0) + 1;
  return counts;
}
