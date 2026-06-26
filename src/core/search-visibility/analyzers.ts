import path from 'node:path';
import { readText, sha256 } from '../fsx.js';
import { officialEvidence, sourceEvidence } from './discovery.js';
import type {
  ClaimEvidence,
  CrawlerPolicySource,
  EntityFact,
  EntityFacts,
  EvidenceRef,
  Finding,
  RouteGraph,
  SiteInventory,
} from './types.js';

export const GOOGLE_AI_FEATURES_URL = 'https://developers.google.com/search/docs/appearance/ai-features';
export const GOOGLE_AI_OPTIMIZATION_URL = 'https://developers.google.com/search/docs/fundamentals/ai-optimization-guide';
export const GOOGLE_STRUCTURED_DATA_URL = 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data';
export const GOOGLE_STRUCTURED_DATA_POLICIES_URL = 'https://developers.google.com/search/docs/appearance/structured-data/sd-policies';
export const GOOGLE_SITEMAP_URL = 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview';
export const GOOGLE_HREFLANG_URL = 'https://developers.google.com/search/docs/specialty/international/localized-versions';
export const GOOGLE_CANONICAL_URL = 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls';
export const GOOGLE_ROBOTS_URL = 'https://developers.google.com/search/docs/crawling-indexing/robots/intro';
export const GOOGLE_SPAM_POLICIES_URL = 'https://developers.google.com/search/docs/essentials/spam-policies';
export const OPENAI_BOTS_URL = 'https://developers.openai.com/api/docs/bots';
export const ANTHROPIC_CRAWLERS_URL = 'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler';
export const LLMS_TXT_URL = 'https://llmstxt.org/';

export async function auditSeo(root: string, inventory: SiteInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  const evidenceBase = packageOrInventoryEvidence(inventory);
  if (inventory.target === 'package' || inventory.package.path) {
    if (!inventory.package.description) findings.push(finding('seo-package-description', 'metadata', 'medium', 'Package description is missing.', evidenceBase, ['package.json'], 'Add a concise factual package description.', true));
    if (!inventory.package.keywords.length) findings.push(finding('seo-package-keywords', 'metadata', 'low', 'Package keywords are missing.', evidenceBase, ['package.json'], 'Add source-backed npm keywords without stuffing.', true));
    if (!inventory.package.repository) findings.push(finding('seo-package-repository', 'metadata', 'medium', 'Repository metadata is missing.', evidenceBase, ['package.json'], 'Set package.json repository to the public project URL.', true));
    if (!inventory.readme.h1) findings.push(finding('seo-readme-h1', 'package-docs', 'medium', 'README H1 is missing.', evidenceBase, [inventory.readme.path || 'README.md'], 'Add a clear H1 matching the package/entity name.', false));
    if (!inventory.readme.command_mentions.length) findings.push(finding('seo-readme-quickstart', 'package-docs', 'low', 'README quickstart command surface is hard to detect.', evidenceBase, [inventory.readme.path || 'README.md'], 'Include exact install and command spellings.', false));
  }
  const robots = inventory.policy_files.filter((file) => file.kind === 'robots' && file.exists);
  const sitemap = inventory.policy_files.filter((file) => file.kind === 'sitemap' && file.exists);
  if (inventory.target !== 'package') {
    if (!robots.length) findings.push(finding('seo-robots-missing', 'indexability', 'low', 'robots.txt was not found; this is not a security issue, but crawl policy is undocumented.', [officialEvidence(GOOGLE_ROBOTS_URL, 'robots.txt is crawl management, not a private-content protection mechanism')], ['robots.txt'], 'Create a managed robots.txt only when project ownership is clear.', true, 'robotsMutation'));
    if (!sitemap.length) findings.push(finding('seo-sitemap-missing', 'sitemap', 'medium', 'Sitemap was not found; sitemap discovery signals are absent.', [officialEvidence(GOOGLE_SITEMAP_URL, 'Sitemaps help discovery but do not guarantee indexing')], ['sitemap.xml'], 'Create a sitemap from confirmed canonical/indexable routes.', true, 'sitemapMutation'));
  }
  for (const html of inventory.html_files) {
    const evidence = [sourceEvidence(html.path, 'HTML file inspected')];
    if (!html.title) findings.push(finding(`seo-title-missing-${slug(html.path)}`, 'metadata', 'medium', `HTML page ${html.path} is missing a title.`, evidence, [html.path], 'Add a factual title aligned with visible page intent.', true, 'metadataMutation'));
    if (!html.description) findings.push(finding(`seo-description-missing-${slug(html.path)}`, 'metadata', 'low', `HTML page ${html.path} is missing a meta description.`, evidence, [html.path], 'Add a concise factual meta description.', true, 'metadataMutation'));
    if (!html.canonical && inventory.origin) findings.push(finding(`seo-canonical-missing-${slug(html.path)}`, 'canonical', 'medium', `HTML page ${html.path} has no canonical URL.`, [sourceEvidence(html.path, 'No canonical link found'), officialEvidence(GOOGLE_CANONICAL_URL, 'Canonical links are signals for preferred duplicate URLs')], [html.path], 'Add an absolute canonical URL only from a verified canonical host.', true, 'metadataMutation'));
    if (html.canonical && !/^https?:\/\//i.test(html.canonical)) findings.push(finding(`seo-canonical-relative-${slug(html.path)}`, 'canonical', 'medium', `HTML page ${html.path} uses a non-absolute canonical URL.`, [sourceEvidence(html.path, `canonical=${html.canonical}`)], [html.path], 'Prefer absolute canonical URLs derived from the verified origin.', true, 'metadataMutation'));
    if (html.jsonLdParseErrors.length) findings.push(finding(`seo-jsonld-parse-${slug(html.path)}`, 'structured-data', 'high', `HTML page ${html.path} has invalid JSON-LD.`, evidence, [html.path], 'Fix JSON syntax before rich-result eligibility claims.', false, 'structuredDataMutation'));
    if (html.jsonLdCount && !html.visibleTextSample) findings.push(finding(`seo-jsonld-visible-parity-${slug(html.path)}`, 'structured-data', 'high', `HTML page ${html.path} has JSON-LD but little visible text evidence.`, [sourceEvidence(html.path, 'Structured data must describe visible/source-backed content'), officialEvidence(GOOGLE_STRUCTURED_DATA_POLICIES_URL, 'Structured data quality guidelines require truthful page content')], [html.path], 'Verify visible-content parity before adding or relying on structured data.', false));
    for (const href of html.links) {
      if (href.startsWith('/') && href !== '/' && href.includes('//')) findings.push(finding(`seo-link-variant-${slug(html.path)}-${slug(href)}`, 'internal-links', 'low', `Internal link ${href} may contain a malformed duplicate slash variant.`, evidence, [html.path], 'Normalize internal links to canonical route variants.', true));
    }
  }
  if (inventory.locale_candidates.length > 1 && !inventory.html_files.some((html) => /alternate/i.test(html.visibleTextSample) || html.links.some((href) => /hreflang/i.test(href)))) {
    findings.push(finding('seo-locale-hreflang-unverified', 'locale', 'medium', 'Multiple locale candidates exist, but hreflang reciprocity is not verified from source inventory.', [officialEvidence(GOOGLE_HREFLANG_URL, 'Localized versions should provide self/reciprocal alternate signals where applicable')], inventory.locale_candidates.map((candidate) => candidate.source), 'Verify self, reciprocal, and x-default locale graph before mutating locale metadata.', false, 'localeMutation'));
  }
  const unsupportedClaims = unsupportedRankingClaims(inventory);
  for (const claim of unsupportedClaims) {
    findings.push(finding(`seo-unsupported-claim-${slug(claim.path)}`, 'truthfulness', 'critical', `Unsupported ranking/traffic guarantee found in ${claim.path}.`, [sourceEvidence(claim.path, claim.text)], [claim.path], 'Remove ranking, traffic, citation, or indexing guarantees unless backed by measured evidence.', false));
  }
  return findings;
}

export async function auditGeo(root: string, inventory: SiteInventory): Promise<{ findings: Finding[]; entityFacts: EntityFacts; claims: ClaimEvidence[]; crawlers: CrawlerPolicySource[]; answerability: any }> {
  const entityFacts = await buildEntityFacts(root, inventory);
  const claims = await buildClaimEvidence(root, inventory, entityFacts);
  const crawlers = buildCrawlerPolicyRegistry();
  const findings: Finding[] = [];
  const baseEvidence = packageOrInventoryEvidence(inventory);
  if (!entityFacts.canonical_name) findings.push(finding('geo-entity-name-missing', 'entity-facts', 'high', 'Canonical entity name could not be established from source evidence.', baseEvidence, ['package.json', 'README.md'], 'Add or align source-backed entity naming before GEO publishing claims.', false));
  if (!entityFacts.facts.length) findings.push(finding('geo-entity-facts-empty', 'entity-facts', 'high', 'No source-backed entity facts were found.', baseEvidence, ['package.json', 'README.md'], 'Record official entity facts with visible source locations.', false));
  if (entityFacts.conflicts.length) findings.push(finding('geo-entity-fact-conflict', 'entity-facts', 'high', 'Entity facts conflict across package/docs/source evidence.', baseEvidence, entityFacts.conflicts.flatMap((conflict) => conflict.sources), 'Resolve conflicting names, URLs, or claims before generating structured or llms.txt outputs.', false));
  const unsafeClaims = claims.filter((claim) => !claim.safe_to_publish);
  for (const claim of unsafeClaims) {
    findings.push(finding(`geo-unsafe-claim-${slug(claim.id)}`, 'claim-evidence', 'critical', `Claim is not safe to publish: ${claim.claim}`, [sourceEvidence(claim.supporting_source, claim.claim, claim.source_hash)], [claim.supporting_source], 'Do not publish commercial, ranking, pricing, review, or availability claims without source evidence and visible parity.', false));
  }
  if (!inventory.html_files.length && !inventory.readme.path) findings.push(finding('geo-answerability-no-visible-source', 'answerability', 'medium', 'No visible README or HTML answer surface was found.', baseEvidence, ['README.md', 'index.html'], 'Add human-visible source content before AI answerability claims.', false));
  const llms = inventory.policy_files.find((file) => file.kind === 'llms' && file.exists);
  if (!llms) {
    findings.push(finding('geo-llms-txt-optional-missing', 'llms-txt', 'info', 'llms.txt is absent; this is not a blocker because llms.txt is optional and experimental.', [officialEvidence(LLMS_TXT_URL, 'llms.txt is a proposal for optional inference-time guidance'), officialEvidence(GOOGLE_AI_OPTIMIZATION_URL, 'Google generative AI search does not require special AI schema or files')], ['llms.txt'], 'Only plan llms.txt when explicitly requested with --include-llms-txt --apply.', true));
  } else if (!llms.managed) {
    findings.push(finding('geo-llms-txt-user-authored', 'llms-txt', 'medium', 'Existing llms.txt has no SKS managed marker; full overwrite is blocked.', [sourceEvidence(llms.path, 'Existing llms.txt is user-authored or unmanaged', llms.hash)], [llms.path], 'Preserve user-authored content and use managed merge only when ownership is clear.', false));
  }
  const answerability = buildAnswerabilityReport(inventory, entityFacts, claims);
  return { findings, entityFacts, claims, crawlers, answerability };
}

export function buildRouteGraph(inventory: SiteInventory): RouteGraph {
  return {
    schema: 'sks.search-visibility.route-graph.v1',
    routes: inventory.routes,
    canonical_edges: inventory.html_files.filter((html) => html.canonical).map((html) => ({ from: routeFromHtmlPath(html.path), to: String(html.canonical), source: html.path })),
    internal_links: inventory.html_files.flatMap((html) => html.links.filter((href) => href.startsWith('/')).map((href) => ({ from: routeFromHtmlPath(html.path), to: href, source: html.path }))),
    redirects: [],
    generated_at: new Date().toISOString(),
  };
}

export function buildCanonicalMap(inventory: SiteInventory): any {
  return {
    schema: 'sks.search-visibility.canonical-map.v1',
    generated_at: new Date().toISOString(),
    origin: inventory.origin,
    groups: inventory.html_files.map((html) => ({
      source: html.path,
      route: routeFromHtmlPath(html.path),
      canonical: html.canonical,
      confidence: html.canonical ? 0.9 : 0.3,
      note: html.canonical ? 'source canonical observed' : 'canonical missing or not verified',
    })),
    warning: 'Canonical signals express preference; final search-engine canonical selection is not guaranteed.',
  };
}

export function buildLocaleGraph(inventory: SiteInventory): any {
  return {
    schema: 'sks.search-visibility.locale-graph.v1',
    generated_at: new Date().toISOString(),
    locales: inventory.locale_candidates,
    checks: {
      self_hreflang_verified: false,
      reciprocal_hreflang_verified: false,
      x_default_verified: false,
      localized_sitemap_rows_verified: false,
    },
    unverified: inventory.locale_candidates.length ? ['hreflang reciprocity requires framework/source-specific verification'] : [],
  };
}

export function buildSitemapAudit(inventory: SiteInventory): any {
  const files = inventory.policy_files.filter((file) => file.kind === 'sitemap' && file.exists);
  return {
    schema: 'sks.search-visibility.sitemap-audit.v1',
    generated_at: new Date().toISOString(),
    sitemap_files: files,
    route_count: inventory.routes.length,
    status: files.length ? 'present_unverified_rows' : 'missing',
    indexing_guarantee: false,
    note: 'Sitemaps are discovery signals and do not guarantee indexing.',
  };
}

export function buildRobotsPolicy(inventory: SiteInventory, crawlers: CrawlerPolicySource[] = buildCrawlerPolicyRegistry()): any {
  return {
    schema: 'sks.search-visibility.robots-policy.v1',
    generated_at: new Date().toISOString(),
    robots_files: inventory.policy_files.filter((file) => file.kind === 'robots'),
    crawler_policy_sources: crawlers,
    security_note: 'robots.txt is crawl management, not authentication or private-content protection.',
    mutations_blocked_when_unmanaged: true,
  };
}

export function buildStructuredDataLedger(inventory: SiteInventory): any {
  return {
    schema: 'sks.search-visibility.structured-data-ledger.v1',
    generated_at: new Date().toISOString(),
    pages: inventory.html_files.map((html) => ({
      path: html.path,
      json_ld_count: html.jsonLdCount,
      parse_errors: html.jsonLdParseErrors,
      visible_text_sample_present: Boolean(html.visibleTextSample),
      visible_content_parity: html.jsonLdCount ? (html.visibleTextSample ? 'needs_field_level_review' : 'blocked') : 'not_applicable',
    })),
    policies: [GOOGLE_STRUCTURED_DATA_URL, GOOGLE_STRUCTURED_DATA_POLICIES_URL],
  };
}

export function buildInternalLinkGraph(inventory: SiteInventory): any {
  return {
    schema: 'sks.search-visibility.internal-link-graph.v1',
    generated_at: new Date().toISOString(),
    links: inventory.html_files.flatMap((html) => html.links.map((href) => ({ source: html.path, href, internal: href.startsWith('/') }))),
    orphan_routes: inventory.routes.filter((route) => !inventory.html_files.some((html) => html.links.includes(route.path))).map((route) => route.path),
  };
}

export function buildAiCrawlerPolicy(): any {
  return {
    schema: 'sks.search-visibility.ai-crawler-policy.v1',
    generated_at: new Date().toISOString(),
    entries: buildCrawlerPolicyRegistry(),
    policy: {
      single_allow_ai_toggle: false,
      training_auto_allow: false,
      purpose_split_required: true,
      stale_registry_blocks_mutation: true,
    },
  };
}

export function buildLlmsTxtPlan(inventory: SiteInventory, facts: EntityFacts): any {
  const existing = inventory.policy_files.find((file) => file.kind === 'llms' && file.exists);
  return {
    schema: 'sks.search-visibility.llms-txt-plan.v1',
    generated_at: new Date().toISOString(),
    status: existing && !existing.managed ? 'blocked_user_authored_file' : 'optional_candidate',
    experimental_assistive_surface: true,
    required_for_gate: false,
    source: LLMS_TXT_URL,
    candidate_facts: facts.facts,
    privacy_check: {
      private_urls_included: false,
      credentials_included: false,
    },
    blockers: existing && !existing.managed ? ['existing_llms_txt_without_managed_marker'] : [],
  };
}

async function buildEntityFacts(root: string, inventory: SiteInventory): Promise<EntityFacts> {
  const now = new Date().toISOString();
  const facts: EntityFact[] = [];
  if (inventory.package.name) facts.push(entityFact('official_package_name', inventory.package.name, 'package.json#name', [inventory.package.path || 'package.json'], now));
  if (inventory.package.description) facts.push(entityFact('official_description', inventory.package.description, 'package.json#description', [inventory.package.path || 'package.json'], now));
  if (inventory.package.repository) facts.push(entityFact('official_repository', inventory.package.repository, 'package.json#repository', [inventory.package.path || 'package.json'], now));
  if (inventory.package.homepage) facts.push(entityFact('official_homepage', inventory.package.homepage, 'package.json#homepage', [inventory.package.path || 'package.json'], now));
  if (inventory.readme.h1) facts.push(entityFact('readme_heading', inventory.readme.h1, `${inventory.readme.path || 'README.md'}#h1`, [inventory.readme.path || 'README.md'], now));
  const conflicts = detectFactConflicts(facts);
  const canonicalName = inventory.readme.h1 || inventory.package.name;
  const canonicalUrl = inventory.package.homepage || inventory.package.repository || inventory.origin;
  return {
    schema: 'sks.search-visibility.entity-facts.v1',
    entity_id: canonicalName ? `entity:${slug(canonicalName)}` : 'entity:unknown',
    type: inventory.package.bin.length ? 'SoftwareApplication' : 'Unknown',
    canonical_name: canonicalName,
    canonical_url: canonicalUrl,
    facts,
    conflicts,
  };
}

async function buildClaimEvidence(root: string, inventory: SiteInventory, facts: EntityFacts): Promise<ClaimEvidence[]> {
  const claims: ClaimEvidence[] = facts.facts.map((fact, index) => ({
    id: `claim-${String(index + 1).padStart(3, '0')}`,
    claim: `${fact.key}: ${fact.value}`,
    claim_type: fact.key.includes('repository') || fact.key.includes('homepage') ? 'supporting_source' : 'identity',
    supporting_source: fact.source,
    source_hash: null,
    visible_location: fact.visible_on[0] || null,
    confidence: fact.confidence,
    freshness: fact.freshness,
    contradiction: null,
    safe_to_publish: true,
    verification_level: 'locally_verified',
  }));
  const unsupported = unsupportedRankingClaims(inventory);
  for (const item of unsupported) {
    const full = path.join(root, item.path);
    const text = await readText(full, '');
    claims.push({
      id: `unsafe-${slug(item.path)}`,
      claim: item.text,
      claim_type: 'capability',
      supporting_source: item.path,
      source_hash: text ? sha256(text) : null,
      visible_location: item.path,
      confidence: 0.9,
      freshness: 'unknown',
      contradiction: 'Unsupported ranking, traffic, indexing, or AI citation outcome claim.',
      safe_to_publish: false,
      verification_level: 'implemented',
    });
  }
  return claims;
}

function buildAnswerabilityReport(inventory: SiteInventory, facts: EntityFacts, claims: ClaimEvidence[]): any {
  const questions = [
    {
      representative_question: `What is ${facts.canonical_name || inventory.package.name || 'this project'}?`,
      intent_class: 'entity_identity',
      official_answer_page: inventory.readme.path || inventory.html_files[0]?.path || null,
      answer_section: inventory.readme.h1 || inventory.html_files[0]?.title || null,
      supporting_claim_ids: claims.filter((claim) => claim.safe_to_publish).slice(0, 5).map((claim) => claim.id),
      source_freshness: 'stable',
      internal_discovery_path: inventory.readme.path ? ['README.md'] : inventory.routes.map((route) => route.path).slice(0, 5),
      text_availability: Boolean(inventory.readme.path || inventory.html_files.some((html) => html.visibleTextSample)),
      structured_entity_linkage: facts.canonical_url ? 'present_source_backed' : 'missing',
      gaps: facts.facts.length ? [] : ['entity_facts_missing'],
    },
  ];
  return {
    schema: 'sks.search-visibility.answerability-report.v1',
    generated_at: new Date().toISOString(),
    questions,
    ranking_or_citation_claim: false,
    external_observation: 'not_verified',
  };
}

function buildCrawlerPolicyRegistry(): CrawlerPolicySource[] {
  const observedAt = '2026-06-26T00:00:00.000Z';
  const expiresAt = '2026-09-24T00:00:00.000Z';
  return [
    crawler('OAI-SearchBot', 'OpenAI', 'search', OPENAI_BOTS_URL, observedAt, expiresAt, 'Used for ChatGPT search visibility; robots.txt can express crawl preference for this user agent.'),
    crawler('GPTBot', 'OpenAI', 'training', OPENAI_BOTS_URL, observedAt, expiresAt, 'Used for model training related crawling; do not auto-allow training crawler without user choice.'),
    crawler('ChatGPT-User', 'OpenAI', 'user_retrieval', OPENAI_BOTS_URL, observedAt, expiresAt, 'User-directed retrieval agent; not the same as search-index eligibility.'),
    crawler('OAI-AdsBot', 'OpenAI', 'ads_validation', OPENAI_BOTS_URL, observedAt, expiresAt, 'Ads/policy validation crawler; separated from search and training purposes.'),
    crawler('Claude-SearchBot', 'Anthropic', 'search', ANTHROPIC_CRAWLERS_URL, observedAt, expiresAt, 'Search indexing crawler for Claude search surfaces.'),
    crawler('ClaudeBot', 'Anthropic', 'training', ANTHROPIC_CRAWLERS_URL, observedAt, expiresAt, 'Model development/training crawler; do not auto-allow without user choice.'),
    crawler('Claude-User', 'Anthropic', 'user_retrieval', ANTHROPIC_CRAWLERS_URL, observedAt, expiresAt, 'User-directed retrieval agent; policy semantics differ from search crawler.'),
  ];
}

function crawler(userAgent: string, provider: string, purpose: CrawlerPolicySource['purpose'], officialSource: string, observedAt: string, expiresAt: string, robotsSemantics: string): CrawlerPolicySource {
  return { userAgent, provider, purpose, officialSource, observedAt, expiresAt, robotsSemantics };
}

function packageOrInventoryEvidence(inventory: SiteInventory): EvidenceRef[] {
  if (inventory.package.path) return [sourceEvidence(inventory.package.path, 'package metadata inspected')];
  if (inventory.readme.path) return [sourceEvidence(inventory.readme.path, 'README inspected')];
  return [sourceEvidence('.', 'project inventory inspected')];
}

function finding(
  ruleId: string,
  category: string,
  severity: Finding['severity'],
  summary: string,
  evidence: EvidenceRef[],
  affected: string[],
  remediation: string,
  autoFixable: boolean,
  requiredCapability?: Finding['requiredCapability']
): Finding {
  const result: Finding = {
    id: `F-${ruleId}`,
    ruleId,
    domain: ruleId.startsWith('geo') ? 'geo' : ruleId.startsWith('seo') ? 'seo' : 'shared',
    category,
    severity,
    confidence: evidence.length ? 0.9 : 0.4,
    blocking: severity === 'critical',
    summary,
    evidence,
    affected,
    remediation,
    autoFixable,
    status: evidence.length ? 'confirmed' : 'not_verified',
  };
  if (requiredCapability) result.requiredCapability = requiredCapability;
  return result;
}

function unsupportedRankingClaims(inventory: SiteInventory): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const candidates = [
    ...(inventory.package.description ? [{ path: inventory.package.path || 'package.json', text: inventory.package.description }] : []),
    ...(inventory.readme.h1 ? [{ path: inventory.readme.path || 'README.md', text: inventory.readme.h1 }] : []),
  ];
  for (const html of inventory.html_files) {
    if (html.visibleTextSample) candidates.push({ path: html.path, text: html.visibleTextSample });
  }
  for (const candidate of candidates) {
    if (/(guarantee[ds]?|보장|1위|#1|top\s*rank|rank\s*#?1|traffic\s+(?:lift|increase)|AI\s+(?:citation|answer)\s+guarantee|검색\s*유입\s*증가\s*보장|인용\s*보장)/i.test(candidate.text)) out.push(candidate);
  }
  return out;
}

function detectFactConflicts(facts: EntityFact[]): EntityFacts['conflicts'] {
  const byKey = new Map<string, EntityFact[]>();
  for (const fact of facts) {
    const key = fact.key.replace(/^readme_heading$/, 'official_package_name');
    const current = byKey.get(key) || [];
    current.push(fact);
    byKey.set(key, current);
  }
  const conflicts: EntityFacts['conflicts'] = [];
  for (const [key, rows] of byKey) {
    const values = Array.from(new Set(rows.map((row) => row.value).filter(Boolean)));
    if (values.length > 1) conflicts.push({ key, values, sources: rows.map((row) => row.source) });
  }
  return conflicts;
}

function entityFact(key: string, value: string, source: string, visibleOn: string[], observedAt: string): EntityFact {
  return { key, value, source, visible_on: visibleOn, observed_at: observedAt, confidence: 1, freshness: 'stable' };
}

function routeFromHtmlPath(pathValue: string): string {
  const clean = pathValue.replace(/^public\//, '').replace(/index\.html$/, '').replace(/\.html$/, '');
  const route = `/${clean}`.replace(/\/+/g, '/');
  return route === '/' ? '/' : route.replace(/\/$/, '');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'item';
}
