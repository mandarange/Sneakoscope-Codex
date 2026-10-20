import path from 'node:path';
import { exists, readJson, readText, sha256, writeJsonAtomic, type JsonData } from '../fsx.js';
import { detectProject, discoverSiteInventory } from './discovery.js';
import { createSearchVisibilityMission, resolveSearchVisibilityMission, routeForMode, type SearchVisibilityMission } from './mission.js';
import { runSuperSearch } from '../super-search/index.js';
import { classifyClaim, evaluateMarketingTruthfulness } from './marketing-truthfulness.js';
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

// Marketing describes whichever project it runs in. Every source is that
// project's own: its package metadata and docs, the URLs its package.json
// declares (plus --url), and only the competitors the user names with
// --competitor. Nothing here names SKS.
const INTERNAL_SOURCE_FILES = ['package.json', 'CHANGELOG.md'];

// README sections that say how to use a project rather than what it is.
const NON_POSITIONING_SECTION = /^(?:install(?:ation|ing)?|usage|getting started|quick ?start|setup|requirements|prerequisites|configuration|development|contributing|contributors|license|changelog|faq|support|credits|acknowledg(?:e)?ments|table of contents|contents|testing|tests?|build(?:ing)?|scripts|roadmap|security|code of conduct|authors?|sponsors?|related|see also|links|api|reference|examples?|demo|screenshots?)\b/i;

const MAX_MESSAGE_PILLARS = 4;
const MAX_KEYWORDS = 20;

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

  const internalSources = await collectInternalSources(mission.root, inventory);
  const projectUrls = await projectSourceUrls(mission.root, inventory, options);
  const competitorUrls = unique(options.competitorUrls || []);
  const externalSources = options.offline
    ? []
    : await collectSuperSearchSources(mission, projectUrls, 'external', options.maxMarketingSources);
  const competitorSources = !options.offline && options.includeCompetitors && competitorUrls.length
    ? await collectSuperSearchSources(mission, competitorUrls, 'competitor', options.maxMarketingSources)
    : [];
  const claims = buildMarketingClaims(inventory, internalSources);
  const truth = evaluateMarketingTruthfulness({ claims });
  // A claim the truthfulness gate rejects is kept out of the strategy rather
  // than stopping research: a project's own description may say "fast" without
  // a measurement, and the strategy simply does not repeat it.
  const blockedClaims = claims.filter((claim) => !claim.publishable || claim.blockers.length || truth.unsupported_claims.includes(claim.id));
  const blockers: string[] = [];
  if (!internalSources.length) blockers.push('marketing_internal_sources_missing');
  if (!options.offline && !projectUrls.length) blockers.push('marketing_project_urls_missing');
  else if (!options.offline && !externalSources.some((source) => source.verified)) blockers.push('marketing_external_sources_unverified');
  if (options.includeCompetitors && !competitorUrls.length) blockers.push('marketing_competitor_urls_required');

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
    project_urls: projectUrls,
    competitor_urls: competitorUrls,
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
    project_urls: projectUrls,
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
  const mission = await resolveSearchVisibilityMission(options.root, missionRef || options.strategyRef || 'latest', mode);
  if (!mission) return blockedStrategy(null, ['marketing_research_mission_missing']);
  const research = await readJson<MarketingResearch | null>(path.join(mission.artifactDir, 'marketing-research.json'), null);
  if (!research) return blockedStrategy(mission, ['marketing_research_required_for_strategy']);
  if (!research.ok) return blockedStrategy(mission, ['marketing_research_gate_not_passed', ...research.blockers]);
  const inventory = await readJson<SiteInventory | null>(path.join(mission.artifactDir, 'site-inventory.json'), null);
  if (!inventory) return blockedStrategy(mission, ['site_inventory_required_for_strategy']);
  // Pillars quote the README, so the README must still be the one research read.
  const readmeSource = research.internal_sources.find((source) => Boolean(source.path) && source.path === inventory.readme.path);
  const readmeText = readmeSource?.path ? await readText(path.join(mission.root, readmeSource.path), '') : '';
  if (readmeSource?.sha256 && sha256(readmeText) !== readmeSource.sha256) return blockedStrategy(mission, ['marketing_readme_changed_since_research']);
  const strategy = buildMarketingStrategy(mission.id, inventory, research, readmeText);
  const truth = evaluateMarketingTruthfulness({ strategy });
  const strategy_quality = scoreMarketingStrategy(strategy, truth);
  const blockers = [...strategy.blockers, ...truth.blockers, ...strategy_quality.blockers];
  const finalStrategy: MarketingStrategy = { ...strategy, strategy_quality, ok: blockers.length === 0, blockers };
  await writeJsonAtomic(path.join(mission.artifactDir, 'marketing-strategy.json'), finalStrategy);
  await writeJsonAtomic(path.join(mission.artifactDir, 'marketing-truthfulness-gate.json'), {
    ...truth,
    ok: blockers.length === 0,
    blockers,
  });
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

function buildMarketingStrategy(missionId: string, inventory: SiteInventory, research: MarketingResearch, readmeText: string): MarketingStrategy {
  const verifiedId = (source: MarketingSource | undefined) => (source?.verified ? source.id : null);
  const packageSource = verifiedId(research.internal_sources.find((source) => Boolean(source.path) && source.path === inventory.package.path));
  const readmeSource = verifiedId(research.internal_sources.find((source) => Boolean(source.path) && source.path === inventory.readme.path));
  const projectName = inventory.package.name || inventory.readme.h1 || 'This project';
  const excluded: string[] = [];
  const passes = (id: string, text: string, claimType: MarketingClaim['claim_type'], sourceIds: string[]) => {
    const gate = evaluateMarketingTruthfulness({
      claims: [{ id, text, claim_type: claimType, source_ids: sourceIds, publishable: true, blockers: sourceIds.length ? [] : ['source_ids_required'] }],
    });
    if (!gate.ok) excluded.push(...gate.blockers);
    return gate.ok;
  };

  // Positioning is the project's own words: its package description, else the
  // README's opening paragraph. A candidate the truthfulness gate rejects (an
  // unmeasured "fast", a ranking promise) is skipped, never rewritten.
  const candidates = [
    { id: 'positioning-package-description', text: (inventory.package.description || '').trim(), source: packageSource },
    { id: 'positioning-readme-lead', text: readmeLead(readmeText), source: readmeSource },
  ];
  const positioning = candidates.find((candidate) => Boolean(candidate.text && candidate.source)
    && passes(candidate.id, candidate.text, 'positioning', [candidate.source as string])) || null;
  const positioningSource = positioning?.source || null;
  const oneLiner = positioning?.text || '';

  const messagePillars = readmeSections(readmeText)
    .filter((section) => !NON_POSITIONING_SECTION.test(section.title))
    .map((section) => ({ title: section.title, claim: section.lead, source_ids: readmeSource ? [readmeSource] : [] }))
    .filter((pillar, index) => Boolean(pillar.claim)
      && passes(`pillar-${index + 1}`, `${pillar.title}: ${pillar.claim}`, classifyClaim(`${pillar.title}: ${pillar.claim}`), pillar.source_ids))
    .slice(0, MAX_MESSAGE_PILLARS);

  // Keywords only grow: the project's own list first, then its name and the
  // frameworks its package declares.
  const existingKeywords = unique(inventory.package.keywords.map((keyword) => keyword.trim()));
  const identityKeywords = unique([bareName(inventory.package.name), ...frameworkKeywords(inventory)])
    .filter((keyword) => !existingKeywords.includes(keyword));
  const keywords = [...existingKeywords, ...identityKeywords].slice(0, MAX_KEYWORDS);
  const keywordClusters = packageSource
    ? [
      { name: 'package keywords', keywords: existingKeywords, source_ids: [packageSource] },
      { name: 'project identity', keywords: identityKeywords, source_ids: [packageSource] },
    ].filter((cluster) => cluster.keywords.length)
    : [];

  const competitorContrast = research.competitor_sources
    .filter((source) => source.verified && oneLiner)
    .map((source) => ({
      competitor: source.title,
      their_claim: source.summary,
      project_contrast: `${projectName}: ${oneLiner}`,
      source_ids: unique([source.id, positioningSource || '']),
      safe_to_publish: true,
    }))
    .filter((contrast, index) => passes(`competitor-contrast-${index + 1}`, `${contrast.competitor}: ${contrast.their_claim} ${contrast.project_contrast}`, 'competitor', contrast.source_ids));

  const readmePlan: MarketingStrategy['readme_plan'] = positioningSource ? [{
    operation: 'readme-positioning-block-update',
    text: [
      '<!-- BEGIN SKS MARKETING POSITIONING -->',
      oneLiner,
      ...(messagePillars.length ? ['', ...messagePillars.map((pillar) => `- **${pillar.title}:** ${pillar.claim}`)] : []),
      '<!-- END SKS MARKETING POSITIONING -->',
      '',
    ].join('\n'),
    source_ids: unique([positioningSource, ...messagePillars.flatMap((pillar) => pillar.source_ids)]),
  }] : [];

  const packagePlan: MarketingStrategy['package_plan'] = [];
  // An existing description is the author's own and is never replaced.
  if (packageSource && positioningSource && !inventory.package.description) {
    packagePlan.push({ operation: 'package-description-update', description: oneLiner, source_ids: [positioningSource] });
  }
  if (packageSource && identityKeywords.length && passes('package-keywords', keywords.join(', '), 'positioning', [packageSource])) {
    packagePlan.push({ operation: 'package-keywords-update', keywords, source_ids: [packageSource] });
  }

  const strategy: MarketingStrategy = {
    schema: 'sks.search-visibility.marketing-strategy.v1',
    ok: true,
    mission_id: missionId,
    positioning: {
      one_liner: oneLiner,
      source_ids: positioningSource ? [positioningSource] : [],
    },
    message_pillars: messagePillars,
    keyword_clusters: keywordClusters,
    strategy_quality: {
      score: 0,
      source_backed_claims: 0,
      unsupported_claims: 0,
      competitor_contrast_count: competitorContrast.length,
      keyword_cluster_count: keywordClusters.length,
      blockers: [],
    },
    competitor_contrast: competitorContrast,
    readme_plan: readmePlan,
    package_plan: packagePlan,
    docs_plan: [
      { title: 'Document marketing claim sources and prohibited guarantees in release notes.', source_ids: [positioningSource || packageSource || readmeSource].filter(Boolean) as string[], auto_apply: false },
    ],
    do_not_claim: [
      'guaranteed ranking',
      'guaranteed traffic',
      'guaranteed AI citation',
      'best or fastest in its category without a measurement',
      'competitor disparagement',
    ],
    excluded_claims: unique(excluded),
    blockers: [],
  };
  if (!positioningSource) {
    strategy.blockers.push(candidates.some((candidate) => candidate.text && candidate.source) ? 'positioning_claim_unsupported' : 'positioning_source_missing');
  }
  for (const pillar of strategy.message_pillars) {
    if (!pillar.source_ids.length) strategy.blockers.push(`pillar_source_missing:${pillar.title}`);
  }
  for (const plan of strategy.package_plan) {
    if (!plan.source_ids.length) strategy.blockers.push(`package_plan_source_missing:${plan.operation}`);
  }
  return strategy;
}

function scoreMarketingStrategy(strategy: MarketingStrategy, truth: ReturnType<typeof evaluateMarketingTruthfulness>): MarketingStrategy['strategy_quality'] {
  const blockers: string[] = [];
  let score = 0;
  const sourceBackedClaims = countSourceBackedStrategyClaims(strategy);

  if (strategy.positioning.source_ids.length) score += 25;
  else blockers.push('strategy_quality_source_backed_positioning_missing');
  if (strategy.message_pillars.length >= 2 && strategy.message_pillars.every((pillar) => pillar.source_ids.length)) score += 25;
  else blockers.push('strategy_quality_message_pillars_below_threshold');
  if (strategy.keyword_clusters.length >= 1 && strategy.keyword_clusters.every((cluster) => cluster.source_ids.length)) score += 15;
  else blockers.push('strategy_quality_keyword_clusters_missing');
  if (strategy.competitor_contrast.every((contrast) => contrast.safe_to_publish && contrast.source_ids.length)) score += 10;
  else blockers.push('strategy_quality_competitor_contrast_unsafe');
  if (truth.forbidden_phrases.length === 0) score += 15;
  else blockers.push('strategy_quality_forbidden_phrases_present');
  if (truth.unsupported_claims.length === 0) score += 10;
  if (score < 80) blockers.push('strategy_quality_score_below_80');
  if (truth.unsupported_claims.length) blockers.push('strategy_quality_unsupported_claims_present');
  if (truth.source_less_publishable_claims.length) blockers.push('strategy_quality_source_less_publishable_claims_present');

  return {
    score,
    source_backed_claims: sourceBackedClaims,
    unsupported_claims: truth.unsupported_claims.length,
    competitor_contrast_count: strategy.competitor_contrast.length,
    keyword_cluster_count: strategy.keyword_clusters.length,
    blockers: unique(blockers),
  };
}

function countSourceBackedStrategyClaims(strategy: MarketingStrategy): number {
  return [
    strategy.positioning,
    ...strategy.message_pillars,
    ...strategy.keyword_clusters,
    ...strategy.readme_plan,
    ...strategy.package_plan,
    ...strategy.docs_plan,
    ...strategy.competitor_contrast,
  ].filter((item) => item.source_ids.length > 0).length;
}

/** The first prose paragraph of a README: not a heading, badge, image, HTML or code. */
function readmeLead(text: string): string {
  for (const paragraph of paragraphs(stripFencedCode(text))) {
    if (/^(?:#|<|!\[|\[!\[|>|[-*+] |\d+\. |\||<!--)/.test(paragraph)) continue;
    const plain = plainMarkdown(paragraph);
    if (plain.length >= 20) return firstSentences(plain);
  }
  return '';
}

/** Level-2 sections with the first prose sentence under each. */
function readmeSections(text: string): Array<{ title: string; lead: string }> {
  const out: Array<{ title: string; lead: string }> = [];
  const body = stripFencedCode(text);
  const matches = [...body.matchAll(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)];
  for (const [index, match] of matches.entries()) {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index || body.length : body.length;
    const section = body.slice(start, end).split(/^#{1,6}[ \t]/m)[0] || '';
    const lead = paragraphs(section)
      .filter((paragraph) => !/^(?:<|!\[|\[!\[|\||<!--)/.test(paragraph))
      .map((paragraph) => plainMarkdown(paragraph.replace(/^(?:[-*+]|\d+\.)\s+/, '')))
      .find((paragraph) => paragraph.length >= 12) || '';
    out.push({ title: plainMarkdown(match[1] || ''), lead: lead ? firstSentences(lead, 1) : '' });
  }
  return out.filter((section) => section.title);
}

function stripFencedCode(text: string): string {
  return String(text || '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
}

function paragraphs(text: string): string[] {
  return String(text || '').split(/\r?\n[ \t]*\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function plainMarkdown(text: string): string {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__|\*|_)(.+?)\1/g, '$2')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentences(text: string, count = 2): string {
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  const picked = sentences ? sentences.slice(0, count).join(' ').trim() : text;
  return picked.length > 280 ? `${picked.slice(0, 277).trimEnd()}...` : picked;
}

function bareName(name: string | null): string {
  return String(name || '').replace(/^@[^/]+\//, '').trim().toLowerCase();
}

function frameworkKeywords(inventory: SiteInventory): string[] {
  const names: Record<string, string> = { next: 'nextjs', react: 'react', astro: 'astro', nuxt: 'nuxt', svelte: 'svelte' };
  return Object.keys(inventory.package.framework_versions || {}).map((dependency) => names[dependency] || '').filter(Boolean);
}

/** The URLs a project declares for itself; an npm page only for a package that is not private. */
async function projectSourceUrls(root: string, inventory: SiteInventory, options: SearchVisibilityCliOptions): Promise<string[]> {
  const pkg: any = await readJson(path.join(root, 'package.json'), null);
  const published = Boolean(inventory.package.name) && pkg?.private !== true;
  return unique([
    options.url || '',
    inventory.package.homepage || '',
    httpsRepositoryUrl(inventory.package.repository) || '',
    published ? `https://www.npmjs.com/package/${inventory.package.name}` : '',
  ].filter((url) => /^https?:\/\//i.test(url)));
}

function httpsRepositoryUrl(value: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const shorthand = raw.match(/^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/i);
  if (shorthand) {
    const hosts: Record<string, string> = { github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org' };
    return `https://${hosts[(shorthand[1] || 'github').toLowerCase()]}/${shorthand[2]!.replace(/\.git$/i, '')}`;
  }
  const ssh = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  const url = raw.replace(/^git\+/i, '').replace(/^git:\/\//i, 'https://').replace(/\.git$/i, '');
  return /^https?:\/\//i.test(url) ? url : null;
}

async function resolveOrCreateMarketingMission(
  mode: SearchVisibilityMode,
  missionRef: string | null,
  options: SearchVisibilityCliOptions,
  prompt: string
): Promise<SearchVisibilityMission> {
  const explicit = missionRef && missionRef !== 'latest' ? await resolveSearchVisibilityMission(options.root, missionRef, mode) : null;
  if (explicit) return explicit;
  if (missionRef === 'latest') {
    const latest = await resolveSearchVisibilityMission(options.root, 'latest', mode);
    if (latest) return latest;
  }
  return createSearchVisibilityMission(mode, prompt, options);
}

async function collectInternalSources(root: string, inventory: SiteInventory): Promise<MarketingSource[]> {
  const out: MarketingSource[] = [];
  for (const rel of unique([inventory.package.path || '', inventory.readme.path || '', ...INTERNAL_SOURCE_FILES])) {
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

function buildMarketingClaims(inventory: SiteInventory, internalSources: MarketingSource[]): MarketingClaim[] {
  const packageSource = internalSources.find((source) => Boolean(source.path) && source.path === inventory.package.path);
  const readmeSource = internalSources.find((source) => Boolean(source.path) && source.path === inventory.readme.path);
  const claims: MarketingClaim[] = [];
  if (inventory.package.name) claims.push(publishableClaim('pkg-name', `${inventory.package.name} is the package name published in package metadata.`, 'identity', [packageSource?.id]));
  if (inventory.package.description) claims.push(publishableClaim('pkg-description', inventory.package.description, 'capability', [packageSource?.id]));
  if (readmeSource) claims.push(publishableClaim('readme-positioning', `README describes ${inventory.readme.h1 || inventory.package.name || 'the project'}.`, 'positioning', [readmeSource.id]));
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
