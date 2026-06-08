export interface ResearchRepetitionReport {
  schema: 'sks.research-repetition-report.v1'
  paragraph_count: number
  unique_paragraph_count: number
  repeated_paragraph_ratio: number
  repeated_sentence_ratio: number
  ngram_repetition_score: number
  template_phrase_hits: string[]
  blockers: string[]
  ok: boolean
}

export const RESEARCH_TEMPLATE_PHRASES = Object.freeze([
  'Runtime evidence note',
  'This paragraph exists to make report quality measurable',
  'deterministic fixture',
  'mock fixture',
  'summary-only baseline repeated note',
  'Research handoff detail for'
])

export function analyzeResearchRepetition(text: string): ResearchRepetitionReport {
  const body = String(text || '')
  const paragraphs = body.split(/\n\s*\n/g).map((part) => part.trim()).filter(Boolean)
  const paragraphKeys = paragraphs.filter(shouldAnalyzeParagraph).map(normalizeRepeatableText).filter(Boolean)
  const uniqueParagraphs = new Set(paragraphKeys)
  const paragraphCount = paragraphKeys.length
  const repeatedParagraphRatio = paragraphCount ? (paragraphCount - uniqueParagraphs.size) / paragraphCount : 0
  const sentences = body.split(/(?<=[.!?])\s+/g).map((part) => part.trim()).filter((part) => countWords(part) >= 6)
  const sentenceKeys = sentences.map(normalizeRepeatableText).filter(Boolean)
  const repeatedSentenceRatio = sentenceKeys.length ? (sentenceKeys.length - new Set(sentenceKeys).size) / sentenceKeys.length : 0
  const ngramRepetitionScore = repeatedNgramRatio(body, 5)
  const lower = body.toLowerCase()
  const templatePhraseHits = RESEARCH_TEMPLATE_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()))
  const blockers = [
    ...(repeatedParagraphRatio > 0.18 ? ['research_report_repeated_paragraphs'] : []),
    ...(templatePhraseHits.map((phrase) => `research_report_template_phrase_hit:${phrase}`)),
    ...(ngramRepetitionScore > 0.32 ? ['research_report_ngram_repetition_high'] : [])
  ]
  return {
    schema: 'sks.research-repetition-report.v1',
    paragraph_count: paragraphCount,
    unique_paragraph_count: uniqueParagraphs.size,
    repeated_paragraph_ratio: round4(repeatedParagraphRatio),
    repeated_sentence_ratio: round4(repeatedSentenceRatio),
    ngram_repetition_score: round4(ngramRepetitionScore),
    template_phrase_hits: templatePhraseHits,
    blockers,
    ok: blockers.length === 0
  }
}

function repeatedNgramRatio(text: string, size: number): number {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9:_-]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length < size * 2) return 0
  const counts = new Map<string, number>()
  for (let index = 0; index <= words.length - size; index += 1) {
    const gram = words.slice(index, index + size).join(' ')
    counts.set(gram, (counts.get(gram) || 0) + 1)
  }
  const grams = [...counts.values()]
  const repeated = grams.reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  return grams.length ? repeated / grams.length : 0
}

function normalizeRepeatableText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(?:mock-source|shard-[a-z0-9_-]+|source|src|counter|mock-counter|claim|stage-claim|mock-claim)-[a-z0-9_.:-]+\b/g, '<id>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/[^a-z0-9<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shouldAnalyzeParagraph(value: string): boolean {
  const trimmed = String(value || '').trim()
  if (countWords(trimmed) < 18) return false
  if (/^-\s+(?:\[?[a-z0-9_.:-]+\]?[:\]])?/i.test(trimmed)) return false
  return true
}

function countWords(value: string): number {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}
