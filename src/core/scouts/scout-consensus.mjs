import { nowIso } from '../fsx.mjs';
import { SCOUT_CONSENSUS_SCHEMA, SCOUT_COUNT } from './scout-schema.mjs';
import { scoutRouteLabel } from './scout-plan.mjs';

export function buildScoutConsensus({
  missionId = null,
  route = '$Team',
  results = [],
  parallelMode = 'parallel',
  generatedAt = nowIso()
} = {}) {
  const completed = results.filter((result) => result.status === 'done').length;
  const blockers = results.flatMap((result) => result.blockers || []);
  const unverified = results.flatMap((result) => result.unverified || []);
  const findings = results.flatMap((result) => result.findings || []);
  const suggested = results.flatMap((result) => result.suggested_tasks || []);
  const sourcePolicy = summarizeSourcePolicy(results);
  const requiredTests = [...new Set(suggested.flatMap((task) => task.verification || []))];
  const implementationSlices = suggested.length ? suggested.map((task, index) => ({
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
  const dbRequired = results.some((result) => result.scout_id === 'scout-3-safety-db' && result.findings?.some((finding) => finding.kind === 'db' || finding.kind === 'risk'));
  const visualRequired = results.some((result) => result.scout_id === 'scout-4-visual-voxel' && result.required_image_voxel_evidence?.length);
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
      'scout-consensus.json',
      'scout-handoff.md',
      'scout-gate.json'
    ],
    required_image_voxel_evidence: visualRequired ? ['image-voxel-ledger.json'] : [],
    db_safety: {
      required: dbRequired,
      reason: dbRequired ? 'Scout 3 found DB/security/permission risk cues.' : null
    },
    context7: {
      required: results.some((result) => result.context7_required === true),
      libraries: [...new Set(results.flatMap((result) => result.context7_libraries || []))]
    },
    blockers,
    unverified
  };
}

function summarizeSourcePolicy(results = []) {
  const counts = {
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
    fallback_used: counts.static_fixture > 0 || counts.unknown > 0,
    synthetic_static_used: counts.static_fixture > 0,
    mode: counts.parse_failed_blocked ? 'blocked_on_parse_failure' : (counts.parsed_scout_output ? 'parsed_real_outputs' : 'static_or_fixture_outputs'),
    parse_failures_block: true,
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

export function renderScoutHandoff(consensus = {}) {
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

function riskFromFiles(files = []) {
  if (files.some((file) => /db|sql|migration|permission|auth/i.test(file))) return 'high';
  if (files.length > 4) return 'medium';
  return 'low';
}
