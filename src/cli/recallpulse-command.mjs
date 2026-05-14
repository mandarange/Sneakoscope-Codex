import path from 'node:path';
import { readJson, sksRoot } from '../core/fsx.mjs';
import { findLatestMission, missionDir, stateFile } from '../core/mission.mjs';
import {
  EVIDENCE_ENVELOPE_ARTIFACT,
  MISSION_STATUS_LEDGER_ARTIFACT,
  RECALLPULSE_DECISION_ARTIFACT,
  RECALLPULSE_EVAL_ARTIFACT,
  RECALLPULSE_GOVERNANCE_ARTIFACT,
  RECALLPULSE_POLICY,
  RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT,
  RECALLPULSE_TASKS_FILE,
  ROUTE_PROOF_CAPSULE_ARTIFACT,
  buildRecallPulseGovernanceReport,
  buildRecallPulseTaskGoalLedger,
  completeRecallPulseTaskGoal,
  evaluateRecallPulseFixtures,
  readMissionStatusLedger,
  writeRecallPulseArtifacts
} from '../core/recallpulse.mjs';

function flag(args, name) {
  return args.includes(name);
}

export async function recallPulseCommand(sub = 'status', args = []) {
  const root = await sksRoot();
  const action = sub || 'status';
  if (action === 'help' || action === '--help' || action === '-h') return help();
  const missionArg = args.find((arg) => !String(arg).startsWith('--')) || 'latest';
  const id = await resolveMissionId(root, missionArg);
  if (!id) throw new Error('Usage: sks recallpulse run|status|eval|governance|checklist <mission-id|latest> [--json]');
  const state = await readJson(stateFile(root), {});
  if (action === 'run') {
    const result = await writeRecallPulseArtifacts(root, { missionId: id, state, stageId: readOption(args, '--stage', null) });
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS RecallPulse report-only run\n');
    printSummary(root, id, result.decision);
    return;
  }
  if (action === 'status') {
    const status = await recallPulseStatus(root, id);
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    console.log('SKS RecallPulse status\n');
    printSummary(root, id, status.decision);
    console.log(`Status ledger: ${path.relative(root, path.join(missionDir(root, id), MISSION_STATUS_LEDGER_ARTIFACT))}${status.status_ledger ? '' : ' (missing)'}`);
    console.log(`Proof capsule:  ${path.relative(root, path.join(missionDir(root, id), ROUTE_PROOF_CAPSULE_ARTIFACT))}${status.route_proof_capsule ? '' : ' (missing)'}`);
    console.log(`Evidence:       ${path.relative(root, path.join(missionDir(root, id), EVIDENCE_ENVELOPE_ARTIFACT))}${status.evidence_envelope ? '' : ' (missing)'}`);
    return;
  }
  if (action === 'eval') {
    const report = await evaluateRecallPulseFixtures(root, { missionId: id, write: true });
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log('SKS RecallPulse fixture eval\n');
    console.log(`Mission: ${id}`);
    console.log(`Passed:  ${report.passed ? 'yes' : 'no'}`);
    console.log(`File:    ${path.relative(root, path.join(missionDir(root, id), RECALLPULSE_EVAL_ARTIFACT))}`);
    console.log(`Caveat:  ${report.caveat}`);
    return;
  }
  if (action === 'governance') {
    const report = await buildRecallPulseGovernanceReport(root, { missionId: id, writeDecisions: !flag(args, '--no-samples') });
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log('SKS RecallPulse governance report\n');
    console.log(`Mission: ${id}`);
    console.log(`Routes inventoried: ${report.route_gate_inventory.length}`);
    console.log(`Recorded samples:   ${report.rollout.requested_samples.filter((sample) => sample.report_only_decision_recorded).length}/${report.rollout.requested_samples.length}`);
    console.log(`Enforcement:        ${report.shadow_eval.enforcement_decision}`);
    console.log(`File:               ${path.relative(root, path.join(missionDir(root, id), RECALLPULSE_GOVERNANCE_ARTIFACT))}`);
    return;
  }
  if (action === 'checklist') {
    const taskId = readOption(args, '--task', null) || readOption(args, '--id', null);
    const apply = flag(args, '--apply');
    if (taskId && apply) {
      const result = await completeRecallPulseTaskGoal(root, id, taskId, {
        allowOutOfOrder: flag(args, '--allow-out-of-order'),
        evidence: readListOption(args, '--evidence'),
        verification: readListOption(args, '--verification'),
        notes: readOption(args, '--notes', '')
      });
      if (flag(args, '--json')) return console.log(JSON.stringify({ ok: true, applied: true, ...result }, null, 2));
      console.log(`Checked ${result.task.task_id} as a child $Goal checkpoint.`);
      console.log(`Ledger: ${path.relative(root, path.join(missionDir(root, id), RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT))}`);
      return;
    }
    const ledger = await buildRecallPulseTaskGoalLedger(root, id);
    const result = { ok: true, applied: false, file: path.join(root, RECALLPULSE_TASKS_FILE), ledger_file: path.join(root, '.sneakoscope', 'missions', id, RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT), next_task: ledger.next_task, counts: ledger.counts };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`RecallPulse sequential task-goal ledger: ${ledger.counts.checked}/${ledger.counts.total} checked.`);
    console.log(`Next: ${ledger.next_task?.id || 'none'} ${ledger.next_task?.title || ''}`.trim());
    console.log(`Run only after evidence: sks recallpulse checklist ${id} --task ${ledger.next_task?.id || 'T001'} --apply --evidence <path>`);
    return;
  }
  throw new Error(`Unknown recallpulse command: ${action}`);
}

async function recallPulseStatus(root, id) {
  const dir = missionDir(root, id);
  return {
    mission_id: id,
    policy: RECALLPULSE_POLICY,
    decision: await readJson(path.join(dir, RECALLPULSE_DECISION_ARTIFACT), null),
    status_ledger: await readMissionStatusLedger(root, id),
    route_proof_capsule: await readJson(path.join(dir, ROUTE_PROOF_CAPSULE_ARTIFACT), null),
    evidence_envelope: await readJson(path.join(dir, EVIDENCE_ENVELOPE_ARTIFACT), null),
    eval_report: await readJson(path.join(dir, RECALLPULSE_EVAL_ARTIFACT), null)
  };
}

function printSummary(root, id, decision) {
  console.log(`Mission: ${id}`);
  if (!decision) {
    console.log(`Decision: missing (${path.relative(root, path.join(missionDir(root, id), RECALLPULSE_DECISION_ARTIFACT))})`);
    console.log(`Run:      sks recallpulse run ${id}`);
    return;
  }
  console.log(`Decision: ${decision.recommended_action}`);
  console.log(`Stage:    ${decision.stage_id}`);
  console.log(`L1:       ${(decision.l1?.selected || []).map((item) => item.id).join(', ') || 'none'}`);
  console.log(`L3:       ${(decision.l3?.hydration_requests || []).length} hydration request(s)`);
  console.log(`Status:   ${decision.user_visible_status_projection?.message || 'report-only decision written'}`);
}

async function resolveMissionId(root, value = 'latest') {
  if (!value || value === 'latest') return findLatestMission(root);
  return value;
}

function readOption(args = [], name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function readListOption(args = [], name) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function help() {
  console.log(`SKS RecallPulse

Report-only active recall, durable status, RouteProofCapsule, and EvidenceEnvelope utilities.

Commands:
  sks recallpulse run <mission-id|latest> [--json] [--stage before_final]
  sks recallpulse status <mission-id|latest> [--json]
  sks recallpulse eval <mission-id|latest> [--json]
  sks recallpulse governance <mission-id|latest> [--json] [--no-samples]
  sks recallpulse checklist <mission-id|latest> [--json]
  sks recallpulse checklist <mission-id|latest> --task T001 --apply --evidence <path>
`);
}
