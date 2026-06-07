export const RESEARCH_PROMPT_CONTRACT_LINES = Object.freeze([
  'QUALITY CONTRACT: satisfy research-quality-contract.json before setting research-gate.json passed=true.',
  'CLAIM MATRIX: create claim-evidence-matrix.json with key claims, source ids, counterevidence ids, triangulation, and hypothesis status.',
  'SOURCE QUALITY: create source-quality-report.json and record claim_ids on source-ledger sources.',
  'BLUEPRINT: create implementation-blueprint.json and implementation-blueprint.md with at least eight sections.',
  'EXPERIMENT: create experiment-plan.json/.md with at least five steps and a replication-pack.json.',
  'FINAL REVIEW: create research-final-review.json and keep the gate blocked unless approved=true.',
  'READ ONLY: do not mutate repository source during Research; write only route-local mission artifacts.'
])

export function researchPromptContractText() {
  return RESEARCH_PROMPT_CONTRACT_LINES.join('\n')
}

export function validateResearchPromptContract(promptText: any = '') {
  const text = String(promptText || '')
  const requiredTokens = ['research-quality-contract.json', 'claim-evidence-matrix.json', 'source-quality-report.json', 'implementation-blueprint.json', 'experiment-plan.json', 'replication-pack.json', 'research-final-review.json']
  const missing = requiredTokens.filter((token) => !text.includes(token))
  return {
    ok: missing.length === 0,
    blockers: missing.map((token) => `research_prompt_contract_missing:${token}`),
    required_tokens: requiredTokens,
    missing_tokens: missing
  }
}
