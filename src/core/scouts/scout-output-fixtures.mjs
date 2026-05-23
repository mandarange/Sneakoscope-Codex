export function scoutOutputJsonFixture(overrides = {}) {
  return {
    schema: 'sks.scout-result.v3',
    scout_id: 'scout-1-code-surface',
    role: 'Repo / Code Surface Scout',
    route: '$Team',
    status: 'done',
    read_only: true,
    read_only_confirmed: true,
    engine_run_id: 'scout-run-fixture-local-static-00000000',
    scout_session_id: 'scout-run-fixture-local-static-00000000-scout-1-code-surface',
    engine: 'local-static',
    engine_mode: 'local_static',
    output_schema_used: false,
    output_schema_path: null,
    schema_validation: { ok: true, schema: 'sks.scout-result.v3', issues: [] },
    session_lifecycle: { status: 'completed', timeout: false, session_id: 'scout-run-fixture-local-static-00000000-scout-1-code-surface', resume_id: null, lane_id: null },
    artifact_namespace: 'canonical',
    summary: 'Fixture scout output.',
    findings: [{ id: 'finding-1', kind: 'code', claim: 'Fixture finding.', evidence: [], risk: 'low' }],
    suggested_tasks: [{ id: 'task-1', title: 'Fixture task.', files: [], verification: ['npm run packcheck'] }],
    blockers: [],
    unverified: [],
    ...overrides
  };
}

export function scoutOutputMarkdownFixture(overrides = {}) {
  return [
    'Scout notes.',
    '',
    'SCOUT_RESULT_JSON:',
    '```json',
    JSON.stringify(scoutOutputJsonFixture(overrides)),
    '```'
  ].join('\n');
}
