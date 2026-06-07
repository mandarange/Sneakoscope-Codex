export function validateFalsificationCoverage(falsificationLedger: any = null, contract: any = null) {
  const minCases = Number(contract?.min_falsification_cases || 4)
  const cases = Array.isArray(falsificationLedger?.cases) ? falsificationLedger.cases : []
  const completeCases = cases.filter((entry: any) => {
    return String(entry?.id || '').trim()
      && String(entry?.target_claim || entry?.claim_id || '').trim()
      && String(entry?.attack || entry?.counterexample || '').trim()
      && Array.isArray(entry?.source_ids)
      && entry.source_ids.length > 0
      && String(entry?.next_decisive_test || '').trim()
  })
  const blockers = [
    ...(cases.length < minCases ? ['falsification_cases_below_contract'] : []),
    ...(completeCases.length < minCases ? ['falsification_cases_incomplete'] : [])
  ]
  return { ok: blockers.length === 0, blockers, cases: cases.length, complete_cases: completeCases.length, min_cases: minCases }
}
