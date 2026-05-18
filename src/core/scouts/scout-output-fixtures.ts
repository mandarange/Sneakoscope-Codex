// @ts-nocheck
export function scoutOutputJsonFixture(overrides = {}) {
  return {
    schema: 'sks.scout-result.v1',
    scout_id: 'scout-1-code-surface',
    role: 'Repo / Code Surface Scout',
    route: '$Team',
    status: 'done',
    read_only: true,
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
