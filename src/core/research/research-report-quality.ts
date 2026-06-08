import { analyzeResearchRepetition, type ResearchRepetitionReport } from './research-repetition-detector.js'

export const REQUIRED_RESEARCH_REPORT_HEADINGS = [
  'Question',
  'Methodology',
  'Source Map',
  'Key Claims',
  'Evidence Matrix Summary',
  'Counterevidence',
  'Falsification',
  'Implementation Blueprint',
  'Experiment / Validation Plan',
  'Limitations',
  'References'
] as const;

export interface ResearchReportQuality {
  schema: 'sks.research-report-quality.v1'
  word_count: number
  headings_present: string[]
  missing_headings: string[]
  implementation_section_words: number
  references_source_ids: string[]
  source_id_mentions: string[]
  claim_id_mentions: string[]
  source_density_per_1000_words: number
  claim_density_per_1000_words: number
  repetition: ResearchRepetitionReport
  blockers: string[]
  ok: boolean
}

export function analyzeResearchReportQuality(text: string): ResearchReportQuality {
  const body = String(text || '');
  const headings = body.split(/\r?\n/)
    .map((line) => line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const lowerHeadings = headings.map((heading) => normalizeHeading(heading));
  const headingsPresent = REQUIRED_RESEARCH_REPORT_HEADINGS.filter((heading) => lowerHeadings.some((value) => value.includes(normalizeHeading(heading))));
  const missingHeadings = REQUIRED_RESEARCH_REPORT_HEADINGS.filter((heading) => !headingsPresent.includes(heading));
  const implementationText = sectionText(body, 'Implementation Blueprint');
  const referencesText = sectionText(body, 'References');
  const sourceIdMentions = [...new Set([
    ...body.matchAll(/\b(?:source|src|mock-source|shard-[A-Za-z0-9_-]+|counter|mock-counter)-[A-Za-z0-9_.:-]+\b/g)
  ].map((match) => match[0]))];
  const claimIdMentions = [...new Set([
    ...body.matchAll(/\b(?:claim|stage-claim|mock-claim)-[A-Za-z0-9_.:-]+\b/g)
  ].map((match) => match[0]))];
  const wordCount = countWords(body);
  const sourceDensity = densityPer1000(sourceIdMentions.length, wordCount);
  const claimDensity = densityPer1000(claimIdMentions.length, wordCount);
  const repetition = analyzeResearchRepetition(body);
  const blockers = [
    ...missingHeadings.map((heading) => `research_report_heading_missing:${normalizeHeading(heading).replace(/\s+/g, '_')}`),
    ...(sourceIdMentions.length ? [] : ['research_report_references_missing_source_ids']),
    ...(sourceDensity < 4 ? ['research_report_source_density_low'] : []),
    ...(claimDensity < 2 ? ['research_report_claim_density_low'] : []),
    ...repetition.blockers,
    ...(countWords(implementationText) < 300 ? ['implementation_section_too_thin'] : [])
  ];
  return {
    schema: 'sks.research-report-quality.v1',
    word_count: wordCount,
    headings_present: headingsPresent,
    missing_headings: missingHeadings,
    implementation_section_words: countWords(implementationText),
    references_source_ids: referencesText ? sourceIdMentions : [],
    source_id_mentions: sourceIdMentions,
    claim_id_mentions: claimIdMentions,
    source_density_per_1000_words: sourceDensity,
    claim_density_per_1000_words: claimDensity,
    repetition,
    blockers,
    ok: blockers.length === 0
  };
}

export function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function normalizeHeading(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function densityPer1000(count: number, words: number): number {
  if (!words) return 0;
  return Math.round((count / Math.max(1, words / 1000)) * 10000) / 10000;
}

function sectionText(text: string, heading: string): string {
  const lines = String(text || '').split(/\r?\n/);
  const target = normalizeHeading(heading);
  let capture = false;
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      const normalized = normalizeHeading(match[2] || '');
      if (capture) break;
      capture = normalized.includes(target);
      continue;
    }
    if (capture) out.push(line);
  }
  return out.join('\n');
}
