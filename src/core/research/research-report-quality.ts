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
  const referencesSourceIds = [...new Set([
    ...body.matchAll(/\b(?:source|src|mock-source|counter|mock-counter)-[A-Za-z0-9_.:-]+\b/g)
  ].map((match) => match[0]))];
  const blockers = [
    ...missingHeadings.map((heading) => `research_report_heading_missing:${normalizeHeading(heading).replace(/\s+/g, '_')}`),
    ...(referencesSourceIds.length ? [] : ['research_report_references_missing_source_ids'])
  ];
  return {
    schema: 'sks.research-report-quality.v1',
    word_count: countWords(body),
    headings_present: headingsPresent,
    missing_headings: missingHeadings,
    implementation_section_words: countWords(implementationText),
    references_source_ids: referencesText ? referencesSourceIds : [],
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
