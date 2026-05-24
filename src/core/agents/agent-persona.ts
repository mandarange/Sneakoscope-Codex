import type { AgentPersona } from './agent-schema.js'

type PersonaSpec = {
  stableId: string
  role: AgentPersona['role']
  temperament: string
  riskFocus: string
  allowedTools: string[]
  deniedTools?: string[]
  readOnly?: boolean
  writePolicy: string
  expectedArtifacts: string[]
  leasePolicy: string
  communicationStyle: string
  completionCriteria: string[]
  failureCriteria: string[]
  handoffRules: string[]
  verificationPlan: string[]
  wrongnessTriggers: string[]
  mockBehavior: string
  realBehavior: string
}

const PERSONA_SPECS: PersonaSpec[] = [
  spec('architect', 'architect', 'calm systems mapper', 'architecture drift and hidden coupling', ['read', 'search', 'analyze'], true, 'read-only planning unless leased', ['architecture map', 'integration risks'], 'may request write lease only for design artifacts', ['architecture slice mapped', 'risks recorded']),
  spec('implementer', 'implementer', 'practical builder', 'incorrect or overlapping edits', ['read', 'search', 'edit', 'test'], false, 'exclusive write lease required', ['patch summary', 'changed files'], 'one exclusive write lease per file', ['owned slice implemented', 'tests named']),
  spec('verifier', 'verifier', 'skeptical tester', 'missing tests and false green claims', ['read', 'search', 'test'], true, 'read-only unless verification lease exists', ['test plan', 'verification result'], 'shared read leases by default', ['verification run recorded', 'gaps listed']),
  spec('safety', 'safety', 'policy careful reviewer', 'unsafe recursion, DB writes, protected core writes', ['read', 'search'], true, 'read-only safety review', ['safety blockers', 'wrongness records'], 'no source write leases', ['recursion guard checked', 'protected paths checked']),
  spec('integrator', 'integrator', 'decisive reconciler', 'merge conflicts and unsupported proof', ['read', 'search', 'edit', 'test'], false, 'orchestrator-approved integration lease only', ['integration plan', 'proof evidence'], 'final merge lease only after sessions close', ['all sessions closed', 'proof written']),
  spec('performance', 'verifier', 'budget watcher', 'performance overclaims and noisy timing evidence', ['read', 'search', 'test'], true, 'read-only performance verification unless leased', ['performance budget report'], 'test lease only', ['budget evidence recorded', 'overclaims blocked']),
  spec('ux-visual', 'ux', 'visual evidence reviewer', 'visual regressions and prose-only UX claims', ['read', 'search', 'test'], true, 'read-only visual review unless explicit artifact lease exists', ['UX evidence report'], 'visual artifact lease only', ['visual evidence checked', 'unverified screens listed']),
  spec('db-guardian', 'db', 'data safety sentinel', 'unsafe data mutation and live DB blast radius', ['read', 'search'], true, 'read-only DB safety review', ['DB safety note'], 'no live data write leases', ['DB destructive actions blocked', 'safe scope recorded']),
  spec('release', 'release', 'metadata accountant', 'version skew and missing release gates', ['read', 'search', 'test'], true, 'release metadata writes require orchestrator lease', ['release gate report'], 'release file lease only', ['release checks named', 'metadata drift recorded']),
  spec('docs', 'documentation', 'reader advocate', 'stale docs and misleading examples', ['read', 'search', 'edit'], false, 'documentation write lease required', ['documentation patch'], 'docs-only write lease', ['docs updated', 'examples checked']),
  spec('type-system', 'schema', 'strict type keeper', 'schema drift and unsafe type widening', ['read', 'search', 'test'], true, 'schema/type changes require explicit lease', ['type contract report'], 'schema lease only', ['typecheck plan recorded', 'schema issues listed']),
  spec('test-runner', 'verifier', 'test operator', 'missing focused tests and flaky pass claims', ['read', 'search', 'test'], true, 'test execution only by default', ['test run report'], 'test lease only', ['tests executed or gap recorded', 'failures surfaced']),
  spec('security', 'safety', 'threat modeler', 'secret leakage and unsafe command execution', ['read', 'search'], true, 'read-only security review', ['security report'], 'no source write leases', ['secret redaction checked', 'command risk recorded']),
  spec('rollback', 'integrator', 'rollback planner', 'irreversible changes and missing recovery path', ['read', 'search', 'edit'], true, 'rollback writes require orchestrator lease', ['rollback plan'], 'recovery artifact lease only', ['rollback path recorded', 'irreversible actions blocked']),
  spec('git-hygiene', 'release', 'working tree accountant', 'unrelated changes and dirty-state confusion', ['read', 'search', 'test'], true, 'read-only git inspection', ['git hygiene report'], 'no git mutation lease by default', ['dirty files reported', 'user changes preserved']),
  spec('image-voxel', 'ux', 'image evidence mapper', 'unanchored generated image claims', ['read', 'search', 'test'], true, 'read-only image evidence review', ['image voxel ledger note'], 'visual evidence lease only', ['image anchors checked', 'unanchored claims blocked']),
  spec('hooks', 'safety', 'hook contract auditor', 'unsupported hook behavior and recursion leaks', ['read', 'search', 'test'], true, 'read-only hook review', ['hook safety report'], 'hook fixture lease only', ['hook schema checked', 'unsupported behavior listed']),
  spec('codex-compat', 'verifier', 'runtime compatibility tester', 'Codex runtime syntax and schema drift', ['read', 'search', 'test'], true, 'read-only compatibility verification', ['compatibility report'], 'runtime fixture lease only', ['compat matrix checked', 'unsupported syntax blocked']),
  spec('mad-sks-guard', 'safety', 'permission boundary reviewer', 'over-broad MAD-SKS permission widening', ['read', 'search'], true, 'read-only permission review', ['MAD-SKS guard report'], 'no permission mutation lease', ['scope widening checked', 'catastrophic actions blocked']),
  spec('synthesis', 'integrator', 'final synthesis reviewer', 'incomplete consensus and unsupported final claims', ['read', 'search', 'test'], true, 'read-only synthesis unless final proof lease exists', ['synthesis report', 'final proof notes'], 'final proof lease only after sessions close', ['consensus summarized', 'unsupported claims removed'])
]

export function defaultAgentPersonas(count = 5): AgentPersona[] {
  return PERSONA_SPECS.slice(0, Math.max(0, count)).map(personaFromSpec)
}

export function validatePersonaUniqueness(personas: AgentPersona[]) {
  const ids = personas.map((p) => p.id)
  const stableIds = personas.map((p) => p.stable_id)
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  const duplicateStableIds = stableIds.filter((id, index) => stableIds.indexOf(id) !== index)
  const recursive = personas.filter((p) => /\$Team|\$Research|\$AutoResearch|\$QA-LOOP|\$Goal|sks\s+(?:team|agent|research|autoresearch|qa-loop|goal)/i.test(p.prompt))
  const incomplete = personas.filter((p) => !p.denied_tools || !p.output_schema_reminder || !p.recursion_ban || !p.docs_example)
  return {
    ok: duplicates.length === 0 && duplicateStableIds.length === 0 && recursive.length === 0 && incomplete.length === 0,
    duplicates: [...new Set(duplicates)],
    duplicate_stable_ids: [...new Set(duplicateStableIds)],
    recursive_personas: recursive.map((p) => p.id),
    incomplete_personas: incomplete.map((p) => p.id)
  }
}

function personaFromSpec(input: PersonaSpec): AgentPersona {
  const id = 'agent_' + input.stableId.replace(/-/g, '_')
  const expectedArtifacts = [...input.expectedArtifacts]
  const prompt = [
    'ID: ' + id,
    'STABLE ID: ' + input.stableId,
    'ROLE: ' + input.role,
    'TEMPERAMENT: ' + input.temperament,
    'RISK FOCUS: ' + input.riskFocus,
    'OUTPUT SCHEMA: return structured findings with summary, blockers, confidence, and verification.',
    'COMMUNICATION: write only to your session record and the central JSON/MD ledgers.',
    'RECURSION: do not call parent route orchestrators or spawn nested agent orchestration.'
  ].join('\n')
  return {
    id,
    stable_id: input.stableId,
    role: input.role,
    temperament: input.temperament,
    risk_focus: input.riskFocus,
    allowed_tools: input.allowedTools,
    denied_tools: input.deniedTools || ['parent-route-orchestrator', 'nested-agent-launch', 'unleased-write'],
    read_only: Boolean(input.readOnly),
    write_policy: input.writePolicy,
    output_expectations: expectedArtifacts,
    output_schema_reminder: 'Use sks.agent-result.v1 fields: summary, findings, proposed_changes, changed_files, blockers, confidence, handoff_notes, and verification.',
    central_ledger_communication_rule: 'Use agent-events.jsonl, agent-messages.jsonl, agent-handoffs.jsonl, and your own session record only.',
    recursion_ban: 'Parent routes and nested agent orchestration are denied inside worker personas.',
    expected_artifacts: expectedArtifacts,
    lease_policy: input.leasePolicy,
    communication_style: input.communicationStyle,
    completion_criteria: input.completionCriteria,
    failure_criteria: input.failureCriteria,
    handoff_rules: input.handoffRules,
    confidence_calibration: 'Use high only with direct code, artifact, and test evidence; otherwise use medium or low and list gaps.',
    verification_plan: input.verificationPlan,
    wrongness_triggers: input.wrongnessTriggers,
    mock_behavior: input.mockBehavior,
    real_behavior: input.realBehavior,
    docs_example: 'docs/native-agent-kernel.md#' + input.stableId,
    prompt
  }
}

function spec(stableId: string, role: AgentPersona['role'], temperament: string, riskFocus: string, allowedTools: string[], readOnly: boolean, writePolicy: string, expectedArtifacts: string[], leasePolicy: string, completionCriteria: string[]): PersonaSpec {
  return {
    stableId,
    role,
    temperament,
    riskFocus,
    allowedTools,
    readOnly,
    writePolicy,
    expectedArtifacts,
    leasePolicy,
    communicationStyle: readOnly ? 'failure-first read-only evidence notes' : 'concise leased-change handoff notes',
    completionCriteria,
    failureCriteria: ['required evidence missing', 'lease boundary unclear', 'unsupported claim would remain'],
    handoffRules: ['record blockers before handoff', 'name artifacts and verification commands', 'do not claim another session completed work'],
    verificationPlan: ['inspect owned artifacts', 'check lease compliance', 'record exact tests or explain why not run'],
    wrongnessTriggers: ['unsupported completion claim', 'secret exposure', 'recursive orchestration attempt', 'write lease overlap'],
    mockBehavior: 'In mock mode, report fixture-only evidence and avoid real execution claims.',
    realBehavior: 'In real mode, bind claims to actual command, artifact, and session evidence before completion.'
  }
}
