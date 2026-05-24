import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_RECURSIVE_COMMAND_DENYLIST,
  AGENT_WORKER_ENV_GUARD_TOKENS,
  nonRecursivePipelineMarkdown,
  scanNonRecursivePipelinePolicy
} from '../../src/core/agents/agent-recursion-guard.mjs';

test('non-recursive pipeline scanner accepts guarded worker records', () => {
  const report = scanNonRecursivePipelinePolicy(baseRecords());
  assert.equal(report.schema, 'sks.non-recursive-pipeline-report.v1');
  assert.equal(report.ok, true);
  assert.equal(report.local_only, true);
  assert.equal(report.proof.env_guard_configured, true);
  assert.equal(report.proof.command_denylist_enforced, true);
  assert.equal(report.proof.route_denylist_enforced, true);
  assert.equal(report.proof.stdout_transcript_scan, true);
  assert.equal(report.proof.stderr_transcript_scan, true);
  assert.equal(report.proof.agent_result_scan, true);
  assert.equal(report.trust_report.trust, 'high');
  assert.match(nonRecursivePipelineMarkdown(report), /Non-Recursive Agent Pipeline Report/);
});

test('non-recursive pipeline scanner maps nested route attempts to proof and wrongness', () => {
  const report = scanNonRecursivePipelinePolicy([
    ...baseRecords(),
    { path: '.sneakoscope/reports/worker.stdout.txt', channel: 'stdout', text: 'worker attempted sks team with sk-THISSHOULDBEREDACTED1234567890' },
    { path: '.sneakoscope/reports/worker.stderr.txt', channel: 'stderr', text: 'worker attempted $Team' },
    { path: '.sneakoscope/reports/agent-result.json', channel: 'agent_result', text: '{"summary":"run node dist/bin/sks.js agent"}' },
    { path: 'src/core/agents/agent-worker-pipeline.ts', channel: 'source', text: guardedWorkerText('createMission(root, {})\nsetCurrent(root, "M")\n') }
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.secret_redaction_ok, true);
  assert.equal(report.proof.worker_mission_creation_blocked, false);
  assert.equal(report.proof.current_json_write_blocked, false);
  assert.equal(report.proof.top_level_command_blocked, false);
  assert.equal(report.trust_report.trust, 'blocked');
  assert.ok(report.wrongness_records.length >= 4);
  assert.match(JSON.stringify(report), /REDACTED:openai_api_key/);
});

function baseRecords() {
  return [
    { path: 'src/core/agents/agent-worker-pipeline.ts', channel: 'source', text: guardedWorkerText('export const worker = true\n') },
    { path: 'src/core/agents/agent-recursion-guard.ts', channel: 'source', text: AGENT_RECURSIVE_COMMAND_DENYLIST.join('\n') },
    { path: '.sneakoscope/reports/worker.stdout.txt', channel: 'stdout', text: 'worker completed local slice' },
    { path: '.sneakoscope/reports/worker.stderr.txt', channel: 'stderr', text: 'stderr clean' },
    { path: '.sneakoscope/reports/agent-result.json', channel: 'agent_result', text: '{"recursion_guard":{"ok":true,"violations":[]}}' }
  ];
}

function guardedWorkerText(extra) {
  return `${AGENT_WORKER_ENV_GUARD_TOKENS.join('\n')}\n${extra}`;
}
