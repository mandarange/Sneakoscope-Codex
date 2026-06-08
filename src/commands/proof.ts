import { projectRoot } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { collectProofEvidence } from '../core/proof/evidence-collector.js';
import { findLatestMission } from '../core/mission.js';
import { readLatestProof, readLatestProofMarkdown, readRouteProof } from '../core/proof/proof-reader.js';
import { writeRouteCompletionProof } from '../core/proof/route-adapter.js';
import { finalizeRouteWithProof } from '../core/proof/route-finalizer.js';
import { renderProofMarkdown, writeCompletionProof } from '../core/proof/proof-writer.js';
import { validateCompletionProof } from '../core/proof/validation.js';
import { buildRuntimeProofSummary, renderRuntimeProofSummary } from '../core/agents/runtime-proof-summary.js';

export async function run(_command: any, args: any = []) {
  const root = await projectRoot();
  const action = args[0] || 'show';
  const rest = args.slice(1);
  if (action === 'latest' && !flag(args, '--completion')) {
    const runtime = await tryRuntimeProofSummary(root);
    if (runtime) {
      if (flag(args, '--json')) return printJson(runtime);
      console.log(renderRuntimeProofSummary(runtime));
      return;
    }
  }
  if (action === 'show' || action === 'latest') {
    const proof = await withFreshSummaries(root, await readLatestProof(root));
    if (flag(args, '--json') || action === 'latest') return printJson(proof);
    process.stdout.write(renderProofMarkdown(proof));
    return;
  }
  if (action === 'validate') {
    const proof = await withFreshSummaries(root, await readLatestProof(root));
    const validation = validateCompletionProof(proof);
    const result = { schema: 'sks.completion-proof-validation.v1', ok: validation.ok, status: validation.status, issues: validation.issues, proof_status: proof.status };
    if (flag(args, '--json')) return printJson(result);
    console.log(`Completion proof validation: ${result.ok ? 'pass' : 'fail'} (${result.proof_status})`);
    for (const issue of result.issues) console.log(`- ${issue}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'route') {
    const missionArg = rest.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
    const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
    const proof = await readRouteProof(root, missionId);
    const result = proof
      ? { schema: 'sks.completion-proof-route.v1', ok: true, mission_id: missionId, proof }
      : { schema: 'sks.completion-proof-route.v1', ok: false, mission_id: missionId, status: 'blocked', issues: ['completion_proof_missing'] };
    if (flag(args, '--json')) return printJson(result);
    if (proof) process.stdout.write(renderProofMarkdown(proof));
    else console.log(`Completion proof missing for mission ${missionId || 'latest'}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'finalize') {
    const missionArg = rest.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
    const missionId = missionArg === 'latest' ? await findLatestMission(root) : missionArg;
    const routeIndex = args.indexOf('--route');
    const route = routeIndex >= 0 && args[routeIndex + 1] ? args[routeIndex + 1] : '$SKS';
    const result = await finalizeRouteWithProof(root, {
      missionId,
      route,
      strict: flag(args, '--strict'),
      mock: flag(args, '--mock'),
      requireRelation: flag(args, '--require-relation'),
      statusHint: flag(args, '--strict') ? 'verified_partial' : 'verified_partial',
      claims: [{ id: 'proof-finalize', status: 'supported', evidence: `.sneakoscope/missions/${missionId}/completion-proof.json` }],
      unverified: flag(args, '--mock') ? ['Finalizer ran in mock fixture mode.'] : []
    });
    if (flag(args, '--json')) return printJson({ schema: 'sks.completion-proof-finalize.v1', ok: result.ok, mission_id: missionId, validation: result.validation, files: result.files, proof: result.proof });
    console.log(`Completion proof finalized: ${result.files.latest_json}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'export' && (flag(rest, '--md') || flag(args, '--md'))) {
    process.stdout.write(await readLatestProofMarkdown(root));
    return;
  }
  if (action === 'repair' && rest[0] === 'latest') {
    const missionId = await findLatestMission(root);
    const evidence = await collectProofEvidence(root);
    const result = await writeRouteCompletionProof(root, {
      missionId,
      route: '$SKS',
      status: 'verified_partial',
      evidence,
      summary: {
        files_changed: evidence.files?.length || 0,
        commands_run: 1,
        manual_review_required: true
      },
      claims: [{ id: 'proof-repair-latest', status: 'supported', evidence: '.sneakoscope/proof/latest.json' }],
      unverified: ['Repair proof records current local evidence and remains verified_partial until a route-specific gate passes.']
    });
    if (flag(args, '--json')) return printJson({ schema: 'sks.completion-proof-repair.v1', ok: result.ok, mission_id: missionId, files: result.files, validation: result.validation });
    console.log(`Completion proof repaired: ${result.files.latest_json}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'smoke') {
    const evidence = await collectProofEvidence(root);
    const result = await writeCompletionProof(root, {
      route: '$SKS',
      status: 'verified_partial',
      summary: {
        files_changed: evidence.files?.length || 0,
        commands_run: 1,
        tests_passed: 1,
        tests_failed: 0,
        manual_review_required: true
      },
      evidence,
      claims: [{ id: 'proof-smoke', status: 'supported', evidence: '.sneakoscope/proof/latest.json' }],
      unverified: ['Smoke proof is fixture evidence, not a real route completion.']
    }, { command: { cmd: 'sks proof smoke', status: 'verified_partial' } });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Completion proof written: ${result.files.latest_json}`);
    return;
  }
  console.error('Usage: sks proof show|latest|validate|route <mission-id|latest>|finalize <mission-id|latest> [--route route] [--strict] [--mock] [--json]|export --md|repair latest|smoke [--json]');
  process.exitCode = 1;
}

async function tryRuntimeProofSummary(root: string) {
  try {
    const summary = await buildRuntimeProofSummary(root, 'latest');
    if (summary.blockers.includes('parallel_runtime_proof_missing') && summary.blockers.includes('agent_scheduler_state_missing')) return null;
    return summary;
  } catch {
    return null;
  }
}

async function withFreshSummaries(root: any, proof: any) {
  const evidence = await collectProofEvidence(root);
  return {
    ...proof,
    evidence: {
      ...proof.evidence,
      image_voxels: proof.evidence?.image_voxels || evidence.image_voxels,
      triwiki: proof.evidence?.triwiki || evidence.triwiki
    }
  };
}
