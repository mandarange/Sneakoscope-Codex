import path from 'node:path';
import { appendJsonl, ensureDir, nowIso, packageRoot, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { redactSecrets } from '../secret-redaction.js';
import { emptyCompletionProof } from './proof-schema.js';
import { validateCompletionProof } from './validation.js';
import { codexSchemaPath, runCodexExecResumeWithOutputSchema } from '../codex-exec-output-schema.js';

export function proofDir(root: any = packageRoot()) {
  return path.join(root, '.sneakoscope', 'proof');
}

export async function writeCompletionProof(root: any = packageRoot(), input: any = {}, opts: any = {}) {
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

export async function generateCompletionProofWithOutputSchema(root: any = packageRoot(), {
  sessionId,
  prompt,
  outputFile = null
}: any = {}) {
  if (!sessionId) {
    return {
      schema: 'sks.completion-proof-output-schema-run.v1',
      ok: false,
      status: 'integration_optional',
      blocker: 'codex_resume_session_required'
    };
  }
  const schemaPath = await codexSchemaPath('completion-proof');
  return runCodexExecResumeWithOutputSchema({
    sessionId,
    prompt: prompt || 'Generate SKS Completion Proof as strict schema-bound JSON.',
    outputSchemaPath: schemaPath,
    outputFile
  }, { cwd: root });
}

export function renderProofMarkdown(proof: any = {}, validation: any = validateCompletionProof(proof)) {
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
    `- Agents: ${proof.evidence?.agents?.agent_count ?? 0} (${proof.evidence?.agents?.status || 'not_recorded'})`,
    `- TriWiki: ${proof.evidence?.triwiki?.status || 'not_recorded'}`,
    `- Wrongness: ${proof.evidence?.wrongness?.active_count ?? 0} active (${proof.evidence?.wrongness?.high_severity_active ?? 0} high)`,
    `- Lean engineering: ${proof.evidence?.lean_engineering?.semantic_review?.status || proof.evidence?.lean_engineering?.status || 'not_recorded'}`,
    `- Evidence router: ${proof.evidence?.evidence_router?.records ?? 0} record(s)`,
    `- Trust report: ${proof.evidence?.trust_report || 'not_recorded'}`,
    ''
  ];
  const failureAnalysis = proof.failure_analysis;
  if (failureAnalysis && (failureAnalysis.status !== 'not_required' || failureAnalysis.root_cause || failureAnalysis.corrective_action)) {
    lines.push(
      '## Failure Analysis',
      '',
      `- Status: ${failureAnalysis.status || 'unknown'}`,
      `- Root cause: ${failureAnalysis.root_cause || 'not_recorded'}`,
      `- Corrective action: ${failureAnalysis.corrective_action || 'not_recorded'}`,
      `- Evidence: ${Array.isArray(failureAnalysis.evidence) ? failureAnalysis.evidence.length : failureAnalysis.evidence ? 1 : 0}`,
      ''
    );
  }
  lines.push('## Unverified', '');
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

function renderUnverifiedMarkdown(proof: any = {}) {
  const lines = ['# SKS Unverified Claims', ''];
  const items = proof.unverified?.length ? proof.unverified : ['No unverified claims recorded.'];
  for (const item of items) lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
  return `${lines.join('\n')}\n`;
}
