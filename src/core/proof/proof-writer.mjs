import path from 'node:path';
import { appendJsonl, ensureDir, nowIso, packageRoot, writeJsonAtomic, writeTextAtomic } from '../fsx.mjs';
import { redactSecrets } from '../secret-redaction.mjs';
import { emptyCompletionProof } from './proof-schema.mjs';
import { validateCompletionProof } from './validation.mjs';

export function proofDir(root = packageRoot()) {
  return path.join(root, '.sneakoscope', 'proof');
}

export async function writeCompletionProof(root = packageRoot(), input = {}, opts = {}) {
  const proof = redactSecrets(emptyCompletionProof({
    generated_at: nowIso(),
    ...input
  }));
  const validation = validateCompletionProof(proof);
  const dir = proofDir(root);
  await ensureDir(dir);
  const latestJson = path.join(dir, 'latest.json');
  const latestMd = path.join(dir, 'latest.md');
  await writeJsonAtomic(latestJson, proof);
  await writeTextAtomic(latestMd, renderProofMarkdown(proof, validation));
  await writeJsonAtomic(path.join(dir, 'file-changes.json'), proof.evidence?.files || []);
  await writeTextAtomic(path.join(dir, 'unverified.md'), renderUnverifiedMarkdown(proof));
  if (opts.command) await appendJsonl(path.join(dir, 'commands.jsonl'), redactSecrets({ ts: nowIso(), ...opts.command }));
  if (proof.mission_id) {
    const missionDir = path.join(root, '.sneakoscope', 'missions', proof.mission_id);
    await writeJsonAtomic(path.join(missionDir, 'completion-proof.json'), proof);
    await writeTextAtomic(path.join(missionDir, 'completion-proof.md'), renderProofMarkdown(proof, validation));
  }
  return { ok: validation.ok, proof, validation, files: { latest_json: latestJson, latest_md: latestMd } };
}

export function renderProofMarkdown(proof = {}, validation = validateCompletionProof(proof)) {
  const lines = [
    '# SKS Completion Proof',
    '',
    `- Schema: ${proof.schema || 'unknown'}`,
    `- Version: ${proof.version || 'unknown'}`,
    `- Mission: ${proof.mission_id || 'latest-or-null'}`,
    `- Route: ${proof.route || 'unknown'}`,
    `- Status: ${proof.status || 'not_verified'}`,
    `- Validation: ${validation.ok ? 'pass' : 'fail'}`,
    '',
    '## Summary',
    '',
    `- Files changed: ${proof.summary?.files_changed ?? 0}`,
    `- Commands run: ${proof.summary?.commands_run ?? 0}`,
    `- Tests passed: ${proof.summary?.tests_passed ?? 0}`,
    `- Tests failed: ${proof.summary?.tests_failed ?? 0}`,
    `- Manual review required: ${proof.summary?.manual_review_required === false ? 'false' : 'true'}`,
    '',
    '## Evidence',
    '',
    `- Commands: ${proof.evidence?.commands?.length || 0}`,
    `- Files: ${proof.evidence?.files?.length || 0}`,
    `- Image voxels: ${proof.evidence?.image_voxels?.anchors || proof.evidence?.image_voxels?.anchor_count || 0}`,
    `- TriWiki: ${proof.evidence?.triwiki?.status || 'not_recorded'}`,
    '',
    '## Unverified',
    ''
  ];
  const unverified = proof.unverified?.length ? proof.unverified : ['No unverified claims recorded.'];
  for (const item of unverified) lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
  if (proof.blockers?.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of proof.blockers) lines.push(`- ${typeof blocker === 'string' ? blocker : JSON.stringify(blocker)}`);
  }
  if (validation.issues?.length) {
    lines.push('', '## Validation Issues', '');
    for (const issue of validation.issues) lines.push(`- ${issue}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderUnverifiedMarkdown(proof = {}) {
  const lines = ['# SKS Unverified Claims', ''];
  const items = proof.unverified?.length ? proof.unverified : ['No unverified claims recorded.'];
  for (const item of items) lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
  return `${lines.join('\n')}\n`;
}
