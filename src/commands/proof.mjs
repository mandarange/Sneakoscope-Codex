import { projectRoot } from '../core/fsx.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { collectProofEvidence } from '../core/proof/evidence-collector.mjs';
import { findLatestMission } from '../core/mission.mjs';
import { readLatestProof, readLatestProofMarkdown, readRouteProof } from '../core/proof/proof-reader.mjs';
import { writeRouteCompletionProof } from '../core/proof/route-adapter.mjs';
import { renderProofMarkdown, writeCompletionProof } from '../core/proof/proof-writer.mjs';
import { validateCompletionProof } from '../core/proof/validation.mjs';

export async function run(_command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'show';
  const rest = args.slice(1);
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
    const missionArg = rest.find((arg) => !String(arg).startsWith('--')) || 'latest';
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
  console.error('Usage: sks proof show|latest|validate|route <mission-id|latest>|export --md|repair latest|smoke [--json]');
  process.exitCode = 1;
}

async function withFreshSummaries(root, proof) {
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
