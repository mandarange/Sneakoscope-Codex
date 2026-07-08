import type { MarketingClaim, MarketingStrategy, MarketingTruthfulnessGate } from './types.js';

export const FORBIDDEN_MARKETING_PHRASES = [
  'guaranteed ranking',
  'guaranteed traffic',
  'guaranteed AI citation',
  'best Codex tool',
  'fastest Codex harness',
  '100% autonomous',
  'perfectly safe',
  'always correct',
  '검색 순위 보장',
  '트래픽 보장',
  'AI 답변 노출 보장',
  '무조건 최고',
  '완벽히 안전',
  '항상 맞음',
];

const COMPETITOR_DISPARAGEMENT_RE = /\b(?:worse than|inferior to|kills|destroys|beats|crushes|replaces)\b/i;

export function evaluateMarketingTruthfulness(input: {
  claims?: MarketingClaim[];
  strategy?: MarketingStrategy | null;
}): MarketingTruthfulnessGate {
  const claims = [
    ...(input.claims || []),
    ...claimsFromStrategy(input.strategy || null),
  ];
  const unsupported_claims: string[] = [];
  const forbidden_phrases: string[] = [];
  const competitor_disparagement: string[] = [];
  const source_less_publishable_claims: string[] = [];

  for (const claim of claims) {
    const text = claim.text || '';
    const normalized = text.toLowerCase();
    const matchedForbidden = FORBIDDEN_MARKETING_PHRASES.filter((phrase) => normalized.includes(phrase.toLowerCase()));
    if (matchedForbidden.length) forbidden_phrases.push(`${claim.id}:${matchedForbidden.join('|')}`);
    if (COMPETITOR_DISPARAGEMENT_RE.test(text)) competitor_disparagement.push(claim.id);
    if (claim.publishable && !claim.source_ids.length) source_less_publishable_claims.push(claim.id);
    if (!claim.publishable || claim.blockers.length) unsupported_claims.push(claim.id);
    if (/ranking|traffic|AI citation|검색 순위|트래픽|AI 답변 노출/i.test(text) && claim.claim_type !== 'unsupported') {
      unsupported_claims.push(claim.id);
    }
    if ((claim.claim_type === 'performance' || /p95|latency|performance|fast/i.test(text)) && !claim.source_ids.some((id) => /perf|budget|report/i.test(id))) {
      unsupported_claims.push(claim.id);
    }
    if ((claim.claim_type === 'parallel' || /parallel|worker|clone|naruto/i.test(text)) && !claim.source_ids.some((id) => /parallel|naruto|agent|report/i.test(id))) {
      unsupported_claims.push(claim.id);
    }
    if ((claim.claim_type === 'super_search' || /super-search|source-backed|source backed/i.test(text)) && !claim.source_ids.some((id) => /super-search|source|report/i.test(id))) {
      unsupported_claims.push(claim.id);
    }
  }

  const blockers = [
    ...unique(unsupported_claims).map((id) => `unsupported_claim:${id}`),
    ...unique(forbidden_phrases).map((id) => `forbidden_phrase:${id}`),
    ...unique(competitor_disparagement).map((id) => `competitor_disparagement:${id}`),
    ...unique(source_less_publishable_claims).map((id) => `source_less_publishable_claim:${id}`),
  ];
  return {
    schema: 'sks.search-visibility.marketing-truthfulness-gate.v1',
    ok: blockers.length === 0,
    unsupported_claims: unique(unsupported_claims),
    forbidden_phrases: unique(forbidden_phrases),
    competitor_disparagement: unique(competitor_disparagement),
    source_less_publishable_claims: unique(source_less_publishable_claims),
    blockers,
  };
}

function claimsFromStrategy(strategy: MarketingStrategy | null): MarketingClaim[] {
  if (!strategy) return [];
  const out: MarketingClaim[] = [];
  out.push({
    id: 'strategy-positioning',
    text: strategy.positioning.one_liner,
    claim_type: 'positioning',
    source_ids: strategy.positioning.source_ids,
    publishable: true,
    blockers: strategy.positioning.source_ids.length ? [] : ['source_ids_required'],
  });
  for (const [index, pillar] of strategy.message_pillars.entries()) {
    out.push({
      id: `strategy-pillar-${index + 1}`,
      text: pillar.claim,
      claim_type: classifyClaim(pillar.claim),
      source_ids: pillar.source_ids,
      publishable: true,
      blockers: pillar.source_ids.length ? [] : ['source_ids_required'],
    });
  }
  for (const [index, plan] of strategy.readme_plan.entries()) {
    out.push({
      id: `strategy-readme-${index + 1}`,
      text: plan.text,
      claim_type: classifyClaim(plan.text),
      source_ids: plan.source_ids,
      publishable: true,
      blockers: plan.source_ids.length ? [] : ['source_ids_required'],
    });
  }
  for (const [index, plan] of strategy.package_plan.entries()) {
    const text = plan.operation === 'package-description-update'
      ? plan.description
      : plan.keywords.join(', ');
    const packageKeywordBlockers = plan.operation === 'package-keywords-update'
      ? []
      : plan.source_ids.length ? [] : ['source_ids_required'];
    out.push({
      id: `strategy-package-${index + 1}`,
      text,
      claim_type: plan.operation === 'package-keywords-update' ? 'positioning' : classifyClaim(text),
      source_ids: plan.source_ids,
      publishable: true,
      blockers: packageKeywordBlockers,
    });
  }
  return out;
}

export function classifyClaim(text: string): MarketingClaim['claim_type'] {
  if (/super-search|source-backed|source backed/i.test(text)) return 'super_search';
  if (/parallel|worker|clone|naruto/i.test(text)) return 'parallel';
  if (/p95|latency|performance|fast/i.test(text)) return 'performance';
  if (/competitor|alternative|compared/i.test(text)) return 'competitor';
  if (/codex|sneakoscope|sks/i.test(text)) return 'capability';
  return 'positioning';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
