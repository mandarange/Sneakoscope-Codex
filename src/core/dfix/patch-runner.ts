import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, runProcess, sha256, writeJsonAtomic } from '../fsx.js';
import { redactSecrets } from '../secret-redaction.js';

export async function runDfixPatch(root: string, dir: string, opts: any = {}) {
  const started = Date.now();
  const beforeDiff = await gitDiff(root);
  const file = opts.file ? path.resolve(root, opts.file) : null;
  const beforeHash = file ? await fileHash(file) : null;
  const safety = validatePatchSafety(root, opts);
  let changed = false;
  let noOpReason: string | null = null;
  const changedFiles: string[] = [];
  if (!safety.ok) {
    noOpReason = safety.blockers[0] || 'patch_safety_blocked';
  } else if (opts.apply === true && file && opts.findText != null && opts.replaceText != null) {
    const before = await fsp.readFile(file, 'utf8');
    if (!before.includes(String(opts.findText))) noOpReason = 'find_text_not_present';
    else {
      const after = before.split(String(opts.findText)).join(String(opts.replaceText));
      if (after === before) noOpReason = 'replacement_noop';
      else {
        await fsp.writeFile(file, after, 'utf8');
        changed = true;
        changedFiles.push(path.relative(root, file).split(path.sep).join('/'));
      }
    }
  } else {
    noOpReason = opts.apply === true ? 'codex_patch_handoff_requires_external_patch_runner' : 'dry_run_no_patch_applied';
  }
  const afterHash = file ? await fileHash(file) : null;
  const afterDiff = await gitDiff(root);
  const result = redactSecrets({
    schema: 'sks.dfix-patch-runner-result.v1',
    created_at: nowIso(),
    explicit_apply_opt_in: opts.apply === true,
    mode: opts.apply === true ? 'apply' : 'dry_run',
    patch_mode: opts.findText != null && opts.replaceText != null ? 'exact_find_replace' : 'codex_patch_handoff',
    target_file: opts.file || null,
    file_hash_before: beforeHash,
    file_hash_after: afterHash,
    git_diff_before: beforeDiff,
    git_diff_after: afterDiff,
    changed_files: changedFiles,
    patch_applied: changed,
    no_op_detected: !changed,
    no_op_reason: changed ? null : noOpReason,
    rollback_plan: changedFiles.map((rel) => ({ file: rel, action: 'restore from git or apply inverse patch before retrying' })),
    high_risk_blocked: safety.blockers.length > 0,
    blockers: [...safety.blockers, ...(opts.apply === true && !changed ? ['dfix_noop_patch'] : [])],
    patch_duration_ms: Date.now() - started,
    passed: changed || opts.apply !== true
  });
  await writeJsonAtomic(path.join(dir, 'dfix-patch-runner-result.json'), result);
  return result;
}

export function validatePatchSafety(root: string, opts: any = {}) {
  const rel = String(opts.file || '');
  const blockers: string[] = [];
  if (!rel) blockers.push('patch_target_file_missing');
  if (/(^|\/)\.env(?:\.|$)|(^|\/)(?:id_rsa|secrets?|credentials?)(?:\.|$)/i.test(rel)) blockers.push('secret_file_patch_blocked');
  if (/(^|\/)(?:dist|build|coverage|target|node_modules)\//i.test(rel)) blockers.push('generated_file_patch_blocked');
  if (/\.(?:png|jpg|jpeg|gif|webp|pdf|zip|gz|tgz|wasm)$/i.test(rel)) blockers.push('binary_file_patch_blocked');
  if (/package-lock\.json$/i.test(rel) && String(opts.replaceText || '').length > 10_000) blockers.push('package_lock_large_change_high_risk');
  const absolute = path.resolve(root, rel || '.');
  if (!absolute.startsWith(path.resolve(root))) blockers.push('target_outside_project_root');
  return { ok: blockers.length === 0, blockers };
}

async function fileHash(file: string) {
  try {
    return sha256(await fsp.readFile(file)).slice(0, 24);
  } catch {
    return null;
  }
}

async function gitDiff(root: string) {
  const result = await runProcess('git', ['diff', '--'], { cwd: root, timeoutMs: 10_000, maxOutputBytes: 128 * 1024 }).catch((err: unknown) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err),
    timedOut: false
  }));
  return {
    captured: result.code === 0,
    stdout_tail: String(result.stdout || '').slice(-32_000),
    stderr_tail: String(result.stderr || '').slice(-4000),
    timed_out: Boolean(result.timedOut)
  };
}
