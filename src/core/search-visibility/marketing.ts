import path from 'node:path';
import { exists, readJson, readText, sha256, writeJsonAtomic, type JsonData } from '../fsx.js';
import { detectProject, discoverSiteInventory } from './discovery.js';
import { createSearchVisibilityMission, resolveSearchVisibilityMission, routeForMode, type SearchVisibilityMission } from './mission.js';
import { runSuperSearch } from '../super-search/index.js';
import { evaluateMarketingTruthfulness } from './marketing-truthfulness.js';
import type {
  MarketingClaim,
  MarketingResearch,
  MarketingSource,
  MarketingStrategy,
  ProjectContext,
  SearchVisibilityCliOptions,
  SearchVisibilityMode,
  SiteInventory,
} from './types.js';

const INTERNAL_SOURCE_CANDIDATES = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'src/core/routes.ts',
  'src/core/routes/dollar-manifest-lite.ts',
  'src/cli/command-manifest-lite.ts',
  'config/perf-budgets.v1.json',
  '.sneakoscope/reports/perf-budget.json',
  '.sneakoscope/reports/parallel-production-smoke.json',
  '.sneakoscope/reports/super-search-local-http-smoke.json',
  '.sneakoscope/reports/installed-package-smoke.json',
];

const EXTERNAL_SOURCE_URLS = [
  'https://github.com/mandarange/Sneakoscope-Codex',
  'https://www.npmjs.com/package/sneakoscope',
];

const COMPETITOR_SOURCE_URLS = [
  'https://github.com/Yeachan-Heo/oh-my-codex',
  'https://github.com/code-yeongyu/lazycodex',
  'https://www.npmjs.com/package/oh-my-codex',
  'https://www.npmjs.com/package/lazycodex-ai',
];

export async function runMarketingResearch(
  mode: SearchVisibilityMode,
  missionRef: string | null,
  options: SearchVisibilityCliOptions
): Promise<JsonData> {
  const mission = await resolveOrCreateMarketingMission(mode, missionRef, options, 'marketing research');
  const ctx = context(mode, mission.root, options);
  const detected = await detectProject(ctx);
  const inventory = await discoverSiteInventory(ctx, detected);
  await writeJsonAtomic(path.join(mission.artifactDir, 'site-inventory.json'), inventory);

  const internalSources = await collectInternalSources(mission.root);
  const externalSources = options.offline
    ? []
    : await collectSuperSearchSources(mission, EXTERNAL_SOURCE_URLS, 'external', options.maxMarketingSources);
  const competitorSources = !options.offline && options.includeCompetitors
    ? await collectSuperSearchSources(mission, COMPETITOR_SOURCE_URLS, 'competitor', options.maxMarketingSources)
    : [];
  const claims = buildMarketingClaims(inventory, internalSources, externalSources);
  const truth = evaluateMarketingTruthfulness({ claims });
  const blockedClaims = claims.filter((claim) => !claim.publishable || claim.blockers.length || truth.unsupported_claims.includes(claim.id));
  const blockers = [...truth.blockers];
  if (!internalSources.length) blockers.push('marketing_internal_sources_missing');
  if (!options.offline && !externalSources.some((source) => source.verified)) blockers.push('marketing_external_sources_unverified');

  const research: MarketingResearch = {
    schema: 'sks.search-visibility.marketing-research.v1',
    ok: blockers.length === 0,
    mission_id: mission.id,
    internal_sources: internalSources,
    external_sources: externalSources,
    competitor_sources: competitorSources,
    claims,
    blocked_claims: blockedClaims,
    blockers,
  };
  await writeJsonAtomic(path.join(mission.artifactDir, 'marketing-research.json'), research);
  await writeJsonAtomic(path.join(mission.artifactDir, 'marketing-source-ledger.json'), {
    schema: 'sks.search-visibility.marketing-source-ledger.v1',
    mission_id: mission.id,
    sources: [...internalSources, ...externalSources, ...competitorSources],
  });
  await writeJsonAtomic(path.join(mission.artifactDir, 'marketing-claim-ledger.json'), {
    schema: 'sks.search-visibility.marketing-claim-ledger.v1',
    mission_id: mission.id,
    claims,
    blocked_claims: blockedClaims,
  });
  await writeJsonAtomic(path.join(mission.dir, 'marketing-research-gate.json'), {
    schema: 'sks.search-visibility.marketing-research-gate.v1',
    ok: research.ok,
    passed: research.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    truthfulness_gate: truth,
    blockers,
  });
  return {
    schema: 'sks.search-visibility.marketing-research-command.v1',
    ok: research.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    status: research.ok ? 'verified_partial' : 'blocked',
    artifacts_dir: `.sneakoscope/missions/${mission.id}/search-visibility`,
    internal_sources: internalSources.length,
    external_sources: externalSources.length,
    competitor_sources: competitorSources.length,
    claims: claims.length,
    blocked_claims: blockedClaims.length,
    blockers,
  };
}

export async function runMarketingStrategy(
  mode: SearchVisibilityMode,
  missionRef: string | null,
  options: SearchVisibilityCliOptions
): Promise<JsonData> {
  const mission = await resolveSearchVisibilityMission(options.root, missionRef || options.strategyRef || 'latest');
  if (!mission) return blockedStrategy(null, ['marketing_research_mission_missing']);
  const research = await readJson<MarketingResearch | null>(path.join(mission.artifactDir, 'marketing-research.json'), null);
  if (!research) return blockedStrategy(mission, ['marketing_research_required_for_strategy']);
  if (!research.ok) return blockedStrategy(mission, ['marketing_research_gate_not_passed', ...research.blockers]);
  const inventory = await readJson<SiteInventory | null>(path.join(mission.artifactDir, 'site-inventory.json'), null);
  if (!inventory) return blockedStrategy(mission, ['site_inventory_required_for_strategy']);
  const strategy = buildMarketingStrategy(mission.id, inventory, research);
  const truth = evaluateMarketingTruthfulness({ strategy });
  const blockers = [...strategy.blockers, ...truth.blockers];
  const finalStrategy: MarketingStrategy = { ...strategy, ok: blockers.length === 0, blockers };
  await writeJsonAtomic(path.join(mission.artifactDir, 'marketing-strategy.json'), finalStrategy);
  await writeJsonAtomic(path.join(mission.dir, 'seo-marketing-strategy-gate.json'), {
    schema: 'sks.search-visibility.marketing-strategy-gate.v1',
    ok: finalStrategy.ok,
    passed: finalStrategy.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    truthfulness_gate: truth,
    blockers,
  });
  return {
    schema: 'sks.search-visibility.marketing-strategy-command.v1',
    ok: finalStrategy.ok,
    mission_id: mission.id,
    route: routeForMode(mode),
    status: finalStrategy.ok ? 'verified_partial' : 'blocked',
    strategy: 'search-visibility/marketing-strategy.json',
    blockers,
  };
}

export async function readMarketingStrategyForPlan(artifactDir: string): Promise<MarketingStrategy | null> {
  return readJson<MarketingStrategy | null>(path.join(artifactDir, 'marketing-strategy.json'), null);
}

function buildMarketingStrategy(missionId: string, inventory: SiteInventory, research: MarketingResearch): MarketingStrategy {
  const sources = [...research.internal_sources, ...research.external_sources];
  const sourceIds = sources.filter((source) => source.verified).map((source) => source.id);
  const packageSource = sourceIds.find((id) => id.includes('package-json')) || sourceIds[0] || '';
  const readmeSource = sourceIds.find((id) => id.includes('readme')) || packageSource;
  const perfSource = sourceIds.find((id) => id.includes('perf-budget') || id.includes('perf'));
  const parallelSource = sourceIds.find((id) => id.includes('parallel') || id.includes('naruto'));
  const superSearchSource = sourceIds.find((id) => id.includes('super-search'));
  const oneLiner = `${inventory.package.name || 'Sneakoscope'} is a proof-first Codex trust layer for bounded agent workflows, search visibility, and evidence-backed release gates.`;
  const keywords = unique([
    'sneakoscope',
    'codex',
    'sks',
    'codex-cli',
    'codex-app',
    'agent-orchestration',
    'proof-gates',
    'super-search',
    'seo',
    'generative-engine-optimization',
    'bounded-memory',
    'rollback',
    'release-integrity',
  ]).slice(0, 20);
  const strategy: MarketingStrategy = {
    schema: 'sks.search-visibility.marketing-strategy.v1',
    ok: true,
    mission_id: missionId,
    positioning: {
      one_liner: oneLiner,
      source_ids: [packageSource || readmeSource].filter(Boolean),
    },
    message_pillars: [
      { title: 'Proof-first route gates', claim: 'SKS records route artifacts, blockers, and release gates so Codex workflows can separate verified work from unverified claims.', source_ids: [readmeSource || packageSource].filter(Boolean) },
      { title: 'Source-backed search visibility', claim: 'Super-Search and SEO/GEO artifacts keep source ledgers and claim ledgers attached to search visibility work.', source_ids: [superSearchSource || readmeSource || packageSource].filter(Boolean) },
      { title: 'Bounded parallel implementation', claim: 'Naruto and parallel worker reports track changed files, worker evidence, and patch-envelope style proof for multi-agent coding work.', source_ids: [parallelSource || readmeSource || packageSource].filter(Boolean) },
      ...(perfSource ? [{ title: 'Measured fast paths', claim: 'Performance budget reports define p95 budgets for selected SKS fast-path commands.', source_ids: [perfSource] }] : []),
    ],
    keyword_clusters: [
      { name: 'codex trust layer', keywords: keywords.slice(0, 7), source_ids: [packageSource || readmeSource].filter(Boolean) },
      { name: 'agent release integrity', keywords: keywords.slice(7, 14), source_ids: [readmeSource || packageSource].filter(Boolean) },
      { name: 'search visibility', keywords: keywords.slice(7, 11), source_ids: [superSearchSource || packageSource].filter(Boolean) },
    ],
    readme_plan: [{
      operation: 'readme-positioning-block-update',
      text: [
        '<!-- BEGIN SKS MARKETING POSITIONING -->',
        '## Search Visibility Positioning',
        '',
        oneLiner,
        '',
        '- Source-backed claims are kept in SKS marketing research and strategy artifacts.',
        '- SEO/GEO mutation plans update only package metadata and this managed README block in this release.',
        '- Ranking, traffic, and AI citation outcomes are not guaranteed.',
        '<!-- END SKS MARKETING POSITIONING -->',
        '',
      ].join('\n'),
      source_ids: [packageSource || readmeSource].filter(Boolean),
    }],
    package_plan: [
      {
        operation: 'package-description-update',
        description: 'Proof-first Codex trust layer for bounded agent workflows, source-backed search visibility, and release integrity gates.',
        source_ids: [packageSource || readmeSource].filter(Boolean),
      },
      {
        operation: 'package-keywords-update',
        keywords,
        source_ids: [packageSource || readmeSource].filter(Boolean),
      },
    ],
    docs_plan: [
      { title: 'Document marketing claim sources and prohibited guarantees in release notes.', source_ids: [readmeSource || packageSource].filter(Boolean), auto_apply: false },
    ],
    do_not_claim: [
      'guaranteed ranking',
      'guaranteed traffic',
      'guaranteed AI citation',
      'best or fastest Codex tool',
      'competitor disparagement',
    ],
    blockers: [],
  };
  for (const pillar of strategy.message_pillars) {
    if (!pillar.source_ids.length) strategy.blockers.push(`pillar_source_missing:${pillar.title}`);
  }
  for (const plan of strategy.package_plan) {
    if (!plan.source_ids.length) strategy.blockers.push(`package_plan_source_missing:${plan.operation}`);
  }
  if (strategy.positioning.source_ids.length === 0) strategy.blockers.push('positioning_source_missing');
  return strategy;
}

async function resolveOrCreateMarketingMission(
  mode: SearchVisibilityMode,
  missionRef: string | null,
  options: SearchVisibilityCliOptions,
  prompt: string
): Promise<SearchVisibilityMission> {
  const explicit = missionRef && missionRef !== 'latest' ? await resolveSearchVisibilityMission(options.root, missionRef) : null;
  if (explicit) return explicit;
  if (missionRef === 'latest') {
    const latest = await resolveSearchVisibilityMission(options.root, 'latest');
    if (latest) return latest;
  }
  return createSearchVisibilityMission(mode, prompt, options);
}

async function collectInternalSources(root: string): Promise<MarketingSource[]> {
  const out: MarketingSource[] = [];
  for (const rel of INTERNAL_SOURCE_CANDIDATES) {
    const full = path.join(root, rel);
    if (!(await exists(full))) continue;
    const text = await readText(full, '');
    out.push({
      id: sourceId(rel),
      kind: 'internal',
      path: rel,
      url: null,
      title: rel,
      summary: summarizeSource(rel, text),
      sha256: sha256(text),
      verified: true,
      observed_at: new Date().toISOString(),
      blockers: [],
    });
  }
  return out;
}

async function collectSuperSearchSources(
  mission: SearchVisibilityMission,
  urls: string[],
  kind: 'external' | 'competitor',
  maxSources: number
): Promise<MarketingSource[]> {
  const selected = urls.slice(0, Math.max(1, maxSources || urls.length));
  const out: MarketingSource[] = [];
  for (const url of selected) {
    const result = await runSuperSearch({
      missionDir: mission.dir,
      query: url,
      mode: 'url_acquisition',
      env: { SKS_DISABLE_UPDATE_CHECK: '1' },
    }).catch((error: unknown) => ({
      ok: false,
      blockers: [error instanceof Error ? error.message : String(error)],
      sources: [],
    }));
    const verified = Array.isArray(result.sources) ? result.sources.find((source: any) => source.acquisition_verdict === 'verified_content') : null;
    out.push({
      id: sourceId(url),
      kind,
      path: verified?.content_artifact || null,
      url,
      title: verified?.title || url,
      summary: verified?.snippet || `Super-Search source for ${url}`,
      sha256: verified?.content_sha256 || null,
      verified: Boolean(result.ok && verified),
      observed_at: new Date().toISOString(),
      blockers: result.ok && verified ? [] : (Array.isArray(result.blockers) ? result.blockers.map(String) : ['super_search_source_unverified']),
    });
  }
  return out;
}

function buildMarketingClaims(inventory: SiteInventory, internalSources: MarketingSource[], externalSources: MarketingSource[]): MarketingClaim[] {
  const packageSource = internalSources.find((source) => source.path === 'package.json');
  const readmeSource = internalSources.find((source) => source.path === 'README.md');
  const perfSource = internalSources.find((source) => source.path?.includes('perf-budget'));
  const parallelSource = internalSources.find((source) => source.path?.includes('parallel-production-smoke'));
  const superSearchSource = internalSources.find((source) => source.path?.includes('super-search-local-http-smoke')) || externalSources.find((source) => source.verified);
  const claims: MarketingClaim[] = [];
  if (inventory.package.name) claims.push(publishableClaim('pkg-name', `${inventory.package.name} is the package name published in package metadata.`, 'identity', [packageSource?.id]));
  if (inventory.package.description) claims.push(publishableClaim('pkg-description', inventory.package.description, 'capability', [packageSource?.id]));
  if (readmeSource) claims.push(publishableClaim('readme-positioning', `README describes ${inventory.readme.h1 || inventory.package.name || 'the project'} and its SKS command surfaces.`, 'positioning', [readmeSource.id]));
  if (perfSource) claims.push(publishableClaim('perf-budget-source', 'Performance budget artifacts define command p95 budgets for release gates.', 'performance', [perfSource.id]));
  if (parallelSource) claims.push(publishableClaim('parallel-proof-source', 'Parallel production smoke artifacts record changed-file evidence for worker execution.', 'parallel', [parallelSource.id]));
  if (superSearchSource) claims.push(publishableClaim('super-search-source-backed', 'Super-Search artifacts provide source ledgers for search visibility evidence.', 'super_search', [superSearchSource.id]));
  return claims;
}

function publishableClaim(id: string, text: string, claimType: MarketingClaim['claim_type'], sourceIds: Array<string | undefined>): MarketingClaim {
  const source_ids = sourceIds.filter(Boolean) as string[];
  return {
    id,
    text,
    claim_type: claimType,
    source_ids,
    publishable: source_ids.length > 0,
    blockers: source_ids.length ? [] : ['source_ids_required'],
  };
}

function blockedStrategy(mission: SearchVisibilityMission | null, blockers: string[]): JsonData {
  return {
    schema: 'sks.search-visibility.marketing-strategy-command.v1',
    ok: false,
    mission_id: mission?.id || null,
    route: '$SEO-GEO-OPTIMIZER',
    status: 'blocked',
    blockers,
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

function sourceId(value: string): string {
  return value.toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'source';
}

function summarizeSource(rel: string, text: string): string {
  if (rel.endsWith('.json')) return `${rel} JSON source (${Buffer.byteLength(text, 'utf8')} bytes)`;
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || rel;
  return firstLine.replace(/^#+\s*/, '').trim().slice(0, 240);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
