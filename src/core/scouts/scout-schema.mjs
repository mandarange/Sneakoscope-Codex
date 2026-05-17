export const SCOUT_TEAM_PLAN_SCHEMA = 'sks.scout-team-plan.v1';
export const SCOUT_RESULT_SCHEMA = 'sks.scout-result.v1';
export const SCOUT_CONSENSUS_SCHEMA = 'sks.scout-consensus.v1';
export const SCOUT_GATE_SCHEMA = 'sks.scout-gate.v1';
export const SCOUT_PROOF_EVIDENCE_SCHEMA = 'sks.scout-proof-evidence.v1';
export const SCOUT_PERFORMANCE_SCHEMA = 'sks.scout-performance.v1';
export const SCOUT_PERFORMANCE_SUMMARY_SCHEMA = 'sks.scout-performance-summary.v1';

export const FIVE_SCOUT_STAGE_ID = 'five_scout_parallel_intake';
export const SCOUT_COUNT = 5;

export const SCOUT_ROLES = Object.freeze([
  {
    index: 1,
    id: 'scout-1-code-surface',
    role: 'Repo / Code Surface Scout',
    owner_type: 'implementation',
    kind: 'code',
    md: 'scout-1-code-surface.md',
    json: 'scout-1-code-surface.json'
  },
  {
    index: 2,
    id: 'scout-2-verification',
    role: 'Verification / Test Scout',
    owner_type: 'verification',
    kind: 'test',
    md: 'scout-2-verification.md',
    json: 'scout-2-verification.json'
  },
  {
    index: 3,
    id: 'scout-3-safety-db',
    role: 'Safety / DB / Permission Scout',
    owner_type: 'safety',
    kind: 'risk',
    md: 'scout-3-safety-db.md',
    json: 'scout-3-safety-db.json'
  },
  {
    index: 4,
    id: 'scout-4-visual-voxel',
    role: 'Visual / UX / Voxel TriWiki Scout',
    owner_type: 'visual',
    kind: 'visual',
    md: 'scout-4-visual-voxel.md',
    json: 'scout-4-visual-voxel.json'
  },
  {
    index: 5,
    id: 'scout-5-simplification-integration',
    role: 'Simplification / Integration Scout',
    owner_type: 'implementation',
    kind: 'integration',
    md: 'scout-5-simplification-integration.md',
    json: 'scout-5-simplification-integration.json'
  }
]);

export const SCOUT_REQUIRED_OUTPUTS = Object.freeze([
  ...SCOUT_ROLES.flatMap((role) => [role.json, role.md]),
  'scout-consensus.json',
  'scout-handoff.md',
  'scout-gate.json'
]);

export const SCOUT_GATE_OUTPUTS = Object.freeze([
  'scout-team-plan.json',
  'scout-consensus.json',
  'scout-handoff.md',
  'scout-gate.json'
]);

export const SCOUT_ALL_OUTPUTS = Object.freeze([
  'scout-team-plan.json',
  'scout-parallel-ledger.jsonl',
  ...SCOUT_REQUIRED_OUTPUTS,
  'scout-performance.json'
]);
