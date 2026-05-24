#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root, runSksJson } from './sks-1-11-gate-lib.mjs';

const gate = process.argv[2] || path.basename(process.argv[1], '.mjs').replace(/-check$/, '');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const runtimeFiles = [
  'src/core/commands/team-command.ts',
  'src/core/team-dag.ts',
  'src/core/team-live.ts',
  'src/core/tmux-ui.ts',
  'src/core/research.ts',
  'src/core/commands/research-command.ts',
  'src/core/commands/qa-loop-command.ts',
  'src/core/pipeline-internals/runtime-core.ts',
  'src/core/pipeline-internals/runtime-gates.ts',
  'src/core/proof/auto-finalize.ts',
  'src/core/proof/route-finalizer.ts',
  'src/core/proof/route-proof-gate.ts'
];

const agentFiles = [
  'src/core/agents/agent-schema.ts',
  'src/core/agents/agent-command-surface.ts',
  'src/core/agents/agent-orchestrator.ts',
  'src/core/agents/agent-worker-pipeline.ts',
  'src/core/agents/agent-runner-codex-exec.ts',
  'src/core/agents/agent-runner-process.ts',
  'src/core/agents/agent-runner-fake.ts',
  'src/core/agents/agent-runner-tmux.ts',
  'src/core/agents/agent-persona.ts',
  'src/core/agents/agent-roster.ts',
  'src/core/agents/agent-effort-policy.ts',
  'src/core/agents/route-collaboration-ledger.ts',
  'src/core/agents/agent-task-slicer.ts',
  'src/core/agents/agent-work-partition.ts',
  'src/core/agents/agent-lease.ts',
  'src/core/agents/agent-conflict-graph.ts',
  'src/core/agents/agent-central-ledger.ts',
  'src/core/agents/agent-ledger-schemas.ts',
  'src/core/agents/agent-message-bus.ts',
  'src/core/agents/agent-lifecycle.ts',
  'src/core/agents/agent-heartbeat.ts',
  'src/core/agents/agent-consensus.ts',
  'src/core/agents/agent-proof-evidence.ts',
  'src/core/agents/agent-recursion-guard.ts',
  'src/core/agents/agent-recursion-guard.mjs',
  'src/core/agents/agent-output-validator.ts',
  'src/core/agents/agent-cleanup.ts',
  'src/core/agents/agent-trust-report.ts',
  'src/core/agents/agent-wrongness.ts',
  'src/core/commands/agent-command.ts'
];

const workPartitionFiles = [
  'src/core/agents/work-partition/repo-inventory.ts',
  'src/core/agents/work-partition/dependency-graph.ts',
  'src/core/agents/work-partition/semantic-domain-graph.ts',
  'src/core/agents/work-partition/task-slicer.ts',
  'src/core/agents/work-partition/lease-planner.ts',
  'src/core/agents/work-partition/conflict-detector.ts',
  'src/core/agents/work-partition/no-overlap-proof.ts'
];

function text(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assertFiles(files) {
  for (const file of files) assertGate(exists(file), `missing required file: ${file}`);
}

function assertLegacyMultiagentRemoved() {
  const forbidden = [
    /\brunFiveScoutIntake\b/,
    /\bsks\s+scouts\s+run\b/,
    /\bparallel_analysis_scouting\b/,
    /\banalysis_scout(?:_\d+)?\b/
  ];
  for (const file of runtimeFiles) {
    const body = text(file);
    const hits = forbidden.filter((re) => re.test(body)).map(String);
    assertGate(hits.length === 0, `legacy multi-agent runtime reference found in ${file}`, { hits });
  }
  for (const rel of ['src/core/scouts', 'src/core/commands/scouts-command.ts', 'src/commands/scouts.ts', 'schemas/codex/scout-result.schema.json']) {
    assertGate(!exists(rel), `legacy multi-agent surface still present: ${rel}`);
  }
  const registry = text('src/cli/command-registry.ts');
  assertGate(!/\bscouts?\s*:\s*entry\b/.test(registry), 'command registry must not expose legacy multi-agent commands');
}

function assertAgentSurface() {
  assertFiles(agentFiles);
  const registry = text('src/cli/command-registry.ts');
  const tmux = text('src/core/agents/agent-runner-tmux.ts');
  assertGate(/\bagent:\s+entry/.test(registry), 'command registry must expose sks agent');
  assertGate(/'--agent': 'agent'/.test(registry), 'CLI parser must route --agent to agent command');
  assertGate(tmux.includes('buildTmuxAgentPanePlan') && tmux.includes('overview_pane_created') && tmux.includes('self_closing_panes'), 'tmux agent backend must declare overview and self-closing pane policy');
}

function assertNonRecursive() {
  const pipeline = text('src/core/agents/agent-worker-pipeline.ts');
  const guard = text('src/core/agents/agent-recursion-guard.ts');
  const docs = text('docs/agent-non-recursive-pipeline.md');
  const orchestrator = text('src/core/agents/agent-orchestrator.ts');
  const hooks = text('src/core/hooks-runtime.ts');
  assertGate(exists('scripts/non-recursive-pipeline-check.mjs'), 'missing non-recursive pipeline checker script');
  assertGate(exists('schemas/codex/non-recursive-pipeline-report.schema.json'), 'missing non-recursive pipeline report schema');
  for (const token of ['AGENT_WORKER_PIPELINE', 'SKS_AGENT_WORKER', 'SKS_PIPELINE_MODE', 'SKS_DISABLE_ROUTE_RECURSION', 'SKS_AGENT_SESSION_ID', 'SKS_AGENT_ID']) {
    assertGate(pipeline.includes(token), `agent worker pipeline missing ${token}`);
  }
  for (const token of ['sks team', 'sks --agent', 'sks agent run', 'sks research run', 'sks autoresearch run', 'sks goal', '$Team', '$Research', '$AutoResearch', '$QA-LOOP', '$Goal']) {
    assertGate(guard.includes(token), `agent recursion denylist missing ${token}`);
  }
  assertGate(guard.includes('agent-recursion-guard.json'), 'recursion guard report must be written');
  for (const token of ['NON_RECURSIVE_PIPELINE_REPORT_SCHEMA', 'scanNonRecursivePipelinePolicy', 'wrongness_records', 'trust_report', 'evidence_router', 'next_action', 'local_only', 'secret_redaction_ok', 'performance_budget_ms']) {
    assertGate(guard.includes(token), `non-recursive policy module missing ${token}`);
  }
  for (const token of ['env guard', 'command denylist', 'route denylist', 'worker mission creation block', 'current.json write block', 'stdout transcript scan', 'stderr transcript scan', 'agent result scan', 'wrongness record']) {
    assertGate(guard.includes(token), `non-recursive policy contract missing ${token}`);
  }
  assertGate(docs.includes('Non-Recursive Pipeline Policy Report'), 'non-recursive policy docs section missing');
  assertGate(orchestrator.includes('writeAgentRecursionGuardReport'), 'orchestrator must detect recursion attempts');
  assertGate(hooks.includes('agentWorkerHookRecursionDecision') && hooks.includes('scanAgentTextForRecursion'), 'Codex PreToolUse hook must integrate agent recursion guard');
}

function assertCentralLedger() {
  const ledger = text('src/core/agents/agent-central-ledger.ts');
  const schemas = text('src/core/agents/agent-ledger-schemas.ts');
  for (const token of ['agent-events.jsonl', 'agent-sessions.json', 'agent-roster.json', 'agent-task-board.json', 'agent-task-board.md', 'agent-messages.jsonl', 'agent-handoffs.jsonl', 'agent-leases.json', 'agent-conflict-graph.json', 'agent-consensus.json', 'agent-proof-evidence.json', 'current_hash', 'previous_hash']) {
    assertGate(ledger.includes(token), `central ledger missing ${token}`);
  }
  for (const token of ['sks.agent-event.v1', 'sks.agent-message.v1', 'sks.agent-task-board.v1', 'sks.agent-session-record.v1', 'sks.agent-lease-ledger.v1', 'sks.agent-conflict-graph.v1', 'sks.agent-consensus.v1', 'sks.agent-proof-evidence.v1', 'sks.agent-cleanup.v1', 'sks.agent-non-recursive-pipeline.v1', 'additionalProperties: false', 'validateJsonSchemaRecursive']) {
    assertGate(schemas.includes(token), `central ledger schema registry missing ${token}`);
  }
  for (const token of ['validateAgentLedgerWriteScope', 'agent_cannot_modify_other_session_record', 'agent_cannot_modify_orchestrator_only_file']) {
    assertGate(ledger.includes(token), `central ledger write-scope policy missing ${token}`);
  }
  const lifecycle = text('src/core/agents/agent-lifecycle.ts');
  for (const token of ['agent-lifecycle-policy.json', 'agent-lifecycle-aggregate.json', 'agent-timeout-kill-report.json', 'killTimedOutAgentSessions', 'agentHardTimeoutMs', 'SKS_AGENT_HARD_TIMEOUT_MS', 'sks.agent-session-record.v1']) {
    assertGate(lifecycle.includes(token), `agent lifecycle missing ${token}`);
  }
}

function assertWorkPartition() {
  assertFiles(workPartitionFiles);
  const partition = text('src/core/agents/agent-work-partition.ts');
  for (const token of ['inventory', 'dependency', 'semantic', 'lease', 'conflict', 'no_overlap_proof']) {
    assertGate(partition.includes(token), `work partition missing ${token}`);
  }
}

function assertOutputSchema() {
  const schema = JSON.parse(text('schemas/codex/agent-result.schema.json'));
  assertGate(schema.additionalProperties === false, 'agent result schema must close additionalProperties');
  for (const key of ['mission_id', 'agent_id', 'session_id', 'persona_id', 'task_slice_id', 'status', 'summary', 'findings', 'proposed_changes', 'changed_files', 'lease_compliance', 'recursion_guard', 'verification', 'blockers', 'confidence', 'handoff_notes']) {
    assertGate(schema.required.includes(key), `agent result schema missing required ${key}`);
  }
  const validator = text('src/core/agents/agent-output-validator.ts');
  const worker = text('src/core/agents/agent-worker-pipeline.ts');
  assertGate(validator.includes('validateJsonSchemaRecursive'), 'agent output schema must use recursive validator');
  assertGate(worker.includes('schema_invalid:'), 'agent output invalid result must block proof');
}

function assertProofAndTrustArtifacts() {
  const proof = text('src/core/agents/agent-proof-evidence.ts');
  const orchestrator = text('src/core/agents/agent-orchestrator.ts');
  const writers = {
    'agent-cleanup.json': 'writeAgentCleanupReport',
    'agent-trust-report.json': 'writeAgentTrustReport',
    'agent-wrongness-records.json': 'writeAgentWrongnessRecords',
    'agent-output-tails.json': 'writeAgentOutputTailReport',
    'agent-timeout-kill-report.json': 'killTimedOutAgentSessions'
  };
  for (const [token, writer] of Object.entries(writers)) {
    assertGate(proof.includes(token), `agent proof missing ${token}`);
    assertGate(orchestrator.includes(writer), `agent orchestrator does not write ${token}`);
  }
}

function assertPersonaAndCaps() {
  const persona = text('src/core/agents/agent-persona.ts');
  const roster = text('src/core/agents/agent-roster.ts');
  const schema = text('src/core/agents/agent-schema.ts');
  for (const role of ['architect', 'implementer', 'verifier', 'safety', 'integrator']) {
    assertGate(persona.includes(role), `default persona missing ${role}`);
  }
  assertGate(schema.includes('DEFAULT_AGENT_COUNT = 5'), 'default agent count must be 5');
  assertGate(schema.includes('MAX_AGENT_COUNT = 20'), 'max agent count must be 20');
  assertGate(roster.includes('validatePersonaUniqueness'), 'persona uniqueness must be validated');
  assertGate(roster.includes('buildAgentEffortPolicy') && text('src/core/agents/agent-effort-policy.ts').includes('escalation_triggers'), 'agent effort policy must be dynamic and recorded');
  assertGate(roster.includes('exceeds max'), 'agent max cap must block overflow');
}

function assertReleaseScripts() {
  const required = [
    'agent:non-recursive-pipeline',
    'agent:non-recursive-pipeline-report',
    'agent:legacy-multiagent-removed',
    'agent:central-ledger',
    'agent:work-partition',
    'agent:no-overlap-proof',
    'agent:persona-uniqueness',
    'agent:max-cap',
    'agent:fake-backend-blackbox',
    'agent:lifecycle-close',
    'agent:output-schema',
    'agent:lease-conflicts',
    'agent:proof-graph',
    'team:native-agent-backend',
    'research:native-agent-backend',
    'qa:native-agent-backend'
  ];
  for (const name of required) {
    assertGate(Boolean(pkg.scripts?.[name]), `package script missing ${name}`);
    assertGate(pkg.scripts['release:check'].includes(`npm run ${name}`), `release:check missing ${name}`);
  }
}


function assertRouteNativeBlackbox(routeName) {
  if (routeName === 'team') {
    const result = runSksJson(['team', 'native backend fixture', '--mock', '--json']);
    assertGate(result.mock === true, 'Team mock blackbox did not execute', result);
    assertGate(result.native_agent_run?.proof?.ok === true, 'Team blackbox missing native agent proof', result.native_agent_run?.proof);
    assertGate(!JSON.stringify(result).includes('analysis_scout'), 'Team runtime artifact leaked legacy analysis_scout');
  }
  if (routeName === 'research') {
    const prepared = runSksJson(['research', 'prepare', 'native backend fixture', '--json']);
    const result = runSksJson(['research', 'run', prepared.mission_id, '--mock', '--json']);
    assertGate(result.ok === true, 'Research mock blackbox did not pass', result);
    assertGate(result.gate?.gate?.native_agent_proof === true || result.gate?.native_agent_proof === true || result.proof?.ok === true, 'Research proof missing native agent evidence artifact', result);
    assertGate(!JSON.stringify(result).includes('scout-ledger'), 'Research runtime artifact leaked scout-ledger as SSOT');
  }
  if (routeName === 'qa') {
    const prepared = runSksJson(['qa-loop', 'prepare', 'native backend fixture', '--json']);
    const result = runSksJson(['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
    assertGate(result.ok === true, 'QA mock blackbox did not pass', result);
    assertGate(result.gate?.gate?.native_agent_proof === true || result.gate?.native_agent_proof === true || result.proof?.ok === true, 'QA proof missing native agent evidence artifact', result);
  }
}

function assertBlackboxAgent() {
  const result = runSksJson(['agent', 'run', 'fixture', '--mock', '--json']);
  assertGate(result.ok === true, 'fake agent blackbox run failed', result);
  assertGate(result.proof?.fake_backend_disclaimer, 'fake backend disclaimer missing', result.proof);
  assertGate(result.proof?.all_sessions_closed === true, 'agent lifecycle close proof missing', result.proof);
  assertGate(result.proof?.no_overlap_ok === true, 'agent no-overlap proof missing', result.proof);
  assertGate(result.proof?.ledger_hash_chain_ok === true, 'agent ledger hash proof missing', result.proof);
}

assertAgentSurface();
assertReleaseScripts();

if (gate.includes('legacy-multiagent') || gate === 'team-native-agent-backend' || gate === 'research-native-agent-backend' || gate === 'qa-native-agent-backend') assertLegacyMultiagentRemoved();
if (gate === 'team-native-agent-backend') assertRouteNativeBlackbox('team');
if (gate === 'research-native-agent-backend') assertRouteNativeBlackbox('research');
if (gate === 'qa-native-agent-backend') assertRouteNativeBlackbox('qa');
if (gate.includes('non-recursive')) assertNonRecursive();
if (gate.includes('central-ledger')) assertCentralLedger();
if (gate.includes('work-partition') || gate.includes('no-overlap') || gate.includes('lease-conflicts')) assertWorkPartition();
if (gate.includes('persona') || gate.includes('max-cap')) assertPersonaAndCaps();
if (gate.includes('output-schema')) assertOutputSchema();
if (gate.includes('proof-graph') || gate.includes('lifecycle-close') || gate.includes('lease-conflicts')) assertProofAndTrustArtifacts();
if (gate.includes('fake-backend') || gate.includes('lifecycle-close') || gate.includes('proof-graph') || gate.includes('no-overlap') || gate.includes('lease-conflicts')) assertBlackboxAgent();

emitGate(gate, { version: pkg.version, native_agent_kernel: true });
