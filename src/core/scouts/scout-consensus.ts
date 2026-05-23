import { nowIso } from '../fsx.js';
import { SCOUT_CONSENSUS_SCHEMA, SCOUT_COUNT, SCOUT_RESULT_SCHEMA } from './scout-schema.js';
import { scoutRouteLabel } from './scout-plan.js';

export function buildScoutConsensus({
  missionId = null,
  route = '$Team',
  results = [],
  parallelMode = 'parallel',
  generatedAt = nowIso()
}: any = {}) {
  const invalidResults = results.flatMap((result: any) => scoutResultSchemaBlockers(result).map((issue) => `${result?.scout_id || 'unknown'}:${issue}`));
  const consensusResults = results.filter((result: any) => scoutResultSchemaBlockers(result).length === 0 && result.status === 'done');
  const completed = consensusResults.length;
  const blockers = [
    ...results.flatMap((result: any) => result.blockers || []),
    ...invalidResults
  ];
  const unverified = [
    ...results.flatMap((result: any) => result.unverified || []),
    ...(invalidResults.length ? ['Schema-invalid scout results were excluded from consensus/proof promotion.'] : [])
  ];
  const findings = consensusResults.flatMap((result: any) => result.findings || []);
  const suggested = consensusResults.flatMap((result: any) => result.suggested_tasks || []);
  const wrongnessReferences = [...new Set(consensusResults.flatMap((result: any) => result.wrongness_references || []))];
  const activeAvoidanceRules = dedupeRules(consensusResults.flatMap((result: any) => result.wrongness_context?.active_avoidance_rules || []));
  const sourcePolicy = summarizeSourcePolicy(consensusResults, { rejected: invalidResults.length });
  const requiredTests = [...new Set(suggested.flatMap((task: any) => task.verification || []))];
  const implementationSlices = suggested.length ? suggested.map((task: any, index: any) => ({
    id: task.id || `slice-${String(index + 1).padStart(3, '0')}`,
    title: task.title || 'Scout suggested implementation slice',
    files: task.files || [],
    risk: task.risk || riskFromFiles(task.files || []),
    verification: task.verification || []
  })) : [{
    id: 'slice-001',
    title: 'Parent-owned minimal integration path',
    files: [],
    risk: 'medium',
    verification: ['npm run packcheck']
  }];
  const dbRequired = consensusResults.some((result: any) => result.scout_id === 'scout-3-safety-db' && result.findings?.some((finding: any) => finding.kind === 'db' || finding.kind === 'risk'));
  const visualRequired = consensusResults.some((result: any) => result.scout_id === 'scout-4-visual-voxel' && result.required_image_voxel_evidence?.length);
  return {
    schema: SCOUT_CONSENSUS_SCHEMA,
    mission_id: missionId,
    route: scoutRouteLabel(route),
    generated_at: generatedAt,
    scout_count: SCOUT_COUNT,
    completed_scouts: completed,
    parallel_mode: parallelMode,
    status: blockers.length ? 'blocked' : (completed === SCOUT_COUNT ? 'passed' : 'verified_partial'),
    source_policy: sourcePolicy,
    top_findings: findings.slice(0, 10),
    implementation_slices: implementationSlices,
    required_tests: requiredTests.length ? requiredTests : ['npm run packcheck'],
    required_proof_evidence: [
      'completion-proof.json',
      'evidence.scouts',
      'evidence.wrongness',
      'scout-consensus.json',
      'scout-handoff.md',
      'scout-gate.json'
    ],
    wrongness_references: wrongnessReferences,
    active_avoidance_rules: activeAvoidanceRules,
    required_image_voxel_evidence: visualRequired ? ['image-voxel-ledger.json'] : [],
    db_safety: {
      required: dbRequired,
      reason: dbRequired ? 'Scout 3 found DB/security/permission risk cues.' : null
    },
    context7: {
      required: consensusResults.some((result: any) => result.context7_required === true),
      libraries: [...new Set(consensusResults.flatMap((result: any) => result.context7_libraries || []))]
    },
    schema_valid_results: completed,
    schema_invalid_results: invalidResults,
    blockers,
    unverified
  };
}

function dedupeRules(rules: any = []) {
  const seen = new Set();
  const out: any[] = [];
  for (const rule of rules) {
    const key = rule?.id || rule?.text || JSON.stringify(rule);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

function summarizeSourcePolicy(results: any = [], { rejected = 0 }: any = {}) {
  const counts: Record<string, number> = {
    parsed_scout_output: 0,
    static_fixture: 0,
    parse_failed_blocked: 0,
    unknown: 0
  };
  for (const result of results) {
    const policy = result.source_policy || 'unknown';
    counts[policy] = Number(counts[policy] || 0) + 1;
  }
  return {
    primary_source: counts.parsed_scout_output ? 'parsed_real_scout_outputs' : 'local_static_fixture',
    fallback_used: (counts.static_fixture ?? 0) > 0 || (counts.unknown ?? 0) > 0,
    synthetic_static_used: (counts.static_fixture ?? 0) > 0,
    mode: counts.parse_failed_blocked ? 'blocked_on_parse_failure' : (counts.parsed_scout_output ? 'parsed_real_outputs' : 'static_or_fixture_outputs'),
    parse_failures_block: true,
    rejected_schema_invalid_count: rejected,
    counts,
    accepted_sources: [
      'parsed_scout_output',
      'static_fixture'
    ],
    rejected_sources: [
      'unparseable_engine_output',
      'invalid_scout_result_schema'
    ]
  };
}

export function scoutResultSchemaBlockers(result: any = {}) {
  const blockers: string[] = [];
  if (result.schema !== SCOUT_RESULT_SCHEMA) blockers.push(`invalid_schema:${result.schema || 'missing'}`);
  if (result.status !== 'done') blockers.push(`not_done:${result.status || 'missing'}`);
  if (result.schema_validation?.ok === false) blockers.push('schema_validation_failed');
  if (Array.isArray(result.parse_issues) && result.parse_issues.length) blockers.push('parse_issues_present');
  if (result.read_only !== true || result.read_only_confirmed !== true) blockers.push('read_only_not_confirmed');
  return blockers;
}

export function renderScoutHandoff(consensus: any = {}) {
  const lines = [
    '# Five-Scout Consensus Handoff',
    '',
    `Mission: ${consensus.mission_id || 'unknown'}`,
    `Route: ${consensus.route || 'unknown'}`,
    `Status: ${consensus.status || 'unknown'}`,
    `Scouts: ${consensus.completed_scouts || 0}/${consensus.scout_count || SCOUT_COUNT}`,
    `Parallel mode: ${consensus.parallel_mode || 'unknown'}`,
    '',
    '## Implementation Slices',
    ''
  ];
  for (const slice of consensus.implementation_slices || []) {
    lines.push(`- ${slice.id}: ${slice.title}`);
    if (slice.files?.length) lines.push(`  Files: ${slice.files.join(', ')}`);
    if (slice.verification?.length) lines.push(`  Verification: ${slice.verification.join(', ')}`);
  }
  lines.push('', '## Required Tests', '');
  for (const command of consensus.required_tests || []) lines.push(`- ${command}`);
  lines.push('', '## Proof Evidence', '');
  for (const item of consensus.required_proof_evidence || []) lines.push(`- ${item}`);
  if (consensus.wrongness_references?.length) {
    lines.push('', '## Wrongness References', '');
    for (const id of consensus.wrongness_references) lines.push(`- ${id}`);
  }
  if (consensus.blockers?.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of consensus.blockers) lines.push(`- ${blocker}`);
  }
  if (consensus.unverified?.length) {
    lines.push('', '## Unverified', '');
    for (const item of consensus.unverified) lines.push(`- ${item}`);
  }
  return `${lines.join('\n')}\n`;
}

function riskFromFiles(files: any = []) {
  if (files.some((file: any) => /db|sql|migration|permission|auth/i.test(file))) return 'high';
  if (files.length > 4) return 'medium';
  return 'low';
}
