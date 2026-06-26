import path from 'node:path';
import { exists } from '../fsx.js';
import { SEARCH_VISIBILITY_DIR, routeForMode } from './mission.js';
import type { ProjectContext, SearchVisibilityStatus, SiteInventory, VerificationResult } from './types.js';

const COMMON_REQUIRED = [
  'intake.json',
  'adapter-detection.json',
  'site-inventory.json',
  'route-graph.json',
  'robots-policy.json',
  'structured-data-ledger.json',
];

export async function verifySearchVisibility(
  ctx: ProjectContext,
  inventory: SiteInventory,
  mission: { id: string; dir: string; artifactDir: string } | null
): Promise<VerificationResult> {
  const route = routeForMode(ctx.mode);
  const required = [
    ...COMMON_REQUIRED,
    ctx.mode === 'seo' ? 'seo-findings.json' : 'geo-findings.json',
  ];
  const checked = mission
    ? await Promise.all(required.map(async (artifact) => {
        const file = path.join(mission.artifactDir, artifact);
        const present = await exists(file);
        return { path: path.relative(mission.dir, file).split(path.sep).join('/'), ok: present, message: present ? 'present' : 'missing' };
      }))
    : [];
  const blockers = checked.filter((item) => !item.ok).map((item) => `missing_artifact:${item.path}`);
  const productionVerified = Boolean(ctx.origin && !ctx.offline);
  const unverified = [
    ...(ctx.origin && !ctx.offline ? [] : ['production_http_not_verified']),
    ...(ctx.framework === 'unsupported' ? ['framework_specific_mutation_not_verified'] : []),
    ...(ctx.mode === 'geo' ? ['external_ai_answer_observation_not_verified', 'measured_outcome_pending'] : ['search_ranking_or_traffic_outcome_not_measured']),
    ...(!ctx.strict ? ['strict_mode_not_requested'] : []),
  ];
  const status: SearchVisibilityStatus = blockers.length
    ? 'blocked'
    : productionVerified
      ? 'production_verified'
      : 'verified_partial';
  return {
    schema: 'sks.search-visibility.verification-report.v1',
    generated_at: new Date().toISOString(),
    mission_id: mission?.id || 'ad-hoc',
    route,
    status,
    source_verified: inventory.detected_adapter.capabilities.sourceAudit,
    build_verified: false,
    http_verified: productionVerified,
    browser_verified: false,
    production_verified: productionVerified,
    measured_outcome: 'pending',
    checked_artifacts: checked,
    blockers,
    unverified,
  };
}

export function expectedArtifactPath(missionId: string, artifact: string): string {
  if (artifact.endsWith('-gate.json') || artifact === 'completion-proof.json') return `.sneakoscope/missions/${missionId}/${artifact}`;
  return `.sneakoscope/missions/${missionId}/${SEARCH_VISIBILITY_DIR}/${artifact}`;
}
