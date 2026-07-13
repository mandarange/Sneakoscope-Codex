export interface ResearchSourceLayer {
  id: string
  label: string
  purpose: string
  evidence_role: string
  examples: string[]
  query_templates: string[]
}

export const RESEARCH_SOURCE_LAYERS: readonly ResearchSourceLayer[] = Object.freeze([
  {
    id: 'academic_literature',
    label: 'Academic literature',
    purpose: 'Find papers, preprints, reviews, citations, and archival scholarly evidence before synthesis.',
    evidence_role: 'formal_evidence',
    examples: ['arXiv', 'Semantic Scholar', 'OpenAlex', 'Crossref', 'PubMed'],
    query_templates: ['"<topic>" arxiv', '"<topic>" Semantic Scholar', '"<topic>" OpenAlex Crossref PubMed']
  },
  {
    id: 'official_government_data',
    label: 'Official government data',
    purpose: 'Ground claims in public datasets, policy papers, national statistics, and leading-institution sources.',
    evidence_role: 'authoritative_baseline',
    examples: ['World Bank', 'OECD', 'Eurostat', 'data.gov', 'NIST'],
    query_templates: ['"<topic>" site:worldbank.org OR site:oecd.org', '"<topic>" site:data.gov', '"<topic>" site:nist.gov']
  },
  {
    id: 'standards_primary_docs',
    label: 'Standards and primary documents',
    purpose: 'Check specifications, standards, RFCs, policy originals, and official project documents before relying on summaries.',
    evidence_role: 'primary_source',
    examples: ['IETF RFCs', 'W3C', 'ISO abstracts', 'official standards bodies'],
    query_templates: ['"<topic>" RFC standard specification', '"<topic>" W3C IETF NIST standard', '"<topic>" official specification']
  },
  {
    id: 'news_current_events',
    label: 'News and current events',
    purpose: 'Capture recent events, public impact, and regional framing from reputable news and current-event indices.',
    evidence_role: 'recency_signal',
    examples: ['GDELT', 'BBC', 'Reuters', 'AP', 'regional reputable outlets'],
    query_templates: ['"<topic>" latest Reuters AP', '"<topic>" GDELT news', '"<topic>" BBC analysis']
  },
  {
    id: 'public_discourse',
    label: 'Public discourse',
    purpose: 'Sample public practitioner and community discourse without treating popularity as truth.',
    evidence_role: 'sentiment_and_edge_cases',
    examples: ['X/Twitter', 'Reddit', 'Hacker News', 'public forums'],
    query_templates: ['"<topic>" site:x.com OR site:twitter.com', '"<topic>" site:reddit.com', '"<topic>" "Hacker News"']
  },
  {
    id: 'developer_practitioner',
    label: 'Developer and practitioner knowledge',
    purpose: 'Find implementation pitfalls, developer questions, bug reports, and operational lessons.',
    evidence_role: 'practice_feedback',
    examples: ['Stack Overflow', 'Stack Exchange', 'GitHub issues', 'release notes', 'engineering blogs'],
    query_templates: ['"<topic>" site:stackoverflow.com', '"<topic>" site:stackexchange.com', '"<topic>" site:github.com issues']
  },
  {
    id: 'counterevidence_factcheck',
    label: 'Counterevidence and fact checking',
    purpose: 'Actively search for failures, critiques, null results, retractions, fact checks, and source conflicts.',
    evidence_role: 'falsification',
    examples: ['Fact checks', 'Retraction Watch', 'critical reviews', 'benchmark failures', 'negative results'],
    query_templates: ['"<topic>" critique failure limitation', '"<topic>" fact check retraction', '"<topic>" counterevidence null result']
  },
  {
    id: 'local_project_evidence',
    label: 'Local project evidence',
    purpose: 'Inspect repository-local files, scripts, docs, schemas, and tests as implementation evidence for handoff.',
    evidence_role: 'local_evidence',
    examples: ['git ls-files', 'package scripts', 'source modules', 'docs', 'schemas'],
    query_templates: ['git ls-files', 'rg "<topic>" src docs schemas package.json']
  }
])

export const RESEARCH_SOURCE_LAYER_IDS: readonly string[] = Object.freeze(
  RESEARCH_SOURCE_LAYERS.map((layer) => layer.id)
)
