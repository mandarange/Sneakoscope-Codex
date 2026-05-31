#!/usr/bin/env node
// safety:mutation-callsite-coverage (1.20.2 Area 1c).
//
// Static gate: every genuinely-risky mutation on a fixed risk-surface file list
// must be EITHER routed through src/core/safety/mutation-guard.ts OR explicitly
// allowlisted with a function-level reason. A raw risky mutation that is neither
// guarded nor allowlisted fails the gate. The allowlist is function-level (file +
// token + reason), never a blanket file exclusion, so each conscious bypass is
// documented.
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

// Files that perform real global/config/permission/package/process mutations.
const RISK_SURFACE = [
  'src/cli/install-helpers.ts',
  'src/core/codex/codex-config-eperm-repair.ts',
  'src/core/codex/codex-project-config-policy.ts',
  'src/commands/doctor.ts',
  'src/core/skills/core-skill-deployment.ts'
];

// Risky mutation tokens (regex) — the ACTUAL spawn/syscall, not comments/hints.
// `code` flags tokens we only count when the line is real code (not a // comment
// or a quoted hint string), to keep the allowlist meaningful.
const RISKY = [
  { kind: 'package_install_spawn', re: /runProcess\(\s*(npmBin|brew)\b/, code: true },
  { kind: 'process_kill', re: /\bprocess\.kill\(/, code: true },
  { kind: 'file_rename', re: /\bfsp\.rename\(/, code: true },
  { kind: 'chmod', re: /\bfsp\.chmod\(/, code: true },
  { kind: 'chflags', re: /runProcess\(\s*['"]chflags['"]/, code: true },
  { kind: 'xattr', re: /runProcess\(\s*['"]xattr['"]/, code: true },
  { kind: 'copyfile_backup', re: /\bfsp\.copyFile\(/, code: true },
  { kind: 'writefile_backup', re: /\bfsp\.writeFile\(/, code: true }
];

function isComment(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

// Function-level allowlist: each entry says WHY this risky token is safe without
// the guard. Matched by (file endsWith, token substring present on the line).
const ALLOWLIST = [
  // Secret permission HARDENING (0o600) — install-internal, best-effort, narrows
  // access rather than widening it; not user-state mutation.
  { file: 'install-helpers.ts', token: '0o600', reason: 'secret_permission_hardening_install_internal' },
  // Internal package layout binary perms (0o755) — not user state.
  { file: 'install-helpers.ts', token: '0o755', reason: 'internal_package_binary_layout' },
  // EPERM repair: permission RECOVERY commands (xattr/chflags) whose entire
  // purpose is restoring access to an unreadable config; project-scoped, each via
  // repairCommand with a recorded action.
  { file: 'codex-config-eperm-repair.ts', token: "runProcess('xattr'", reason: 'eperm_permission_recovery_via_repairCommand' },
  { file: 'codex-config-eperm-repair.ts', token: "runProcess('chflags'", reason: 'eperm_permission_recovery_via_repairCommand' },
  // Unsafe symlink replacement: project-scoped .codex/config.toml rename with a
  // recorded backup_path (see replaceUnsafeSymlink).
  { file: 'codex-config-eperm-repair.ts', token: 'fsp.rename(', reason: 'unsafe_symlink_replacement_has_backup_project_scoped' },
  // Project config backups (copyFile to .bak) — non-destructive backup OF a
  // mutation; the parent split/structure-repair records the change.
  { file: 'codex-project-config-policy.ts', token: 'fsp.copyFile(', reason: 'non_destructive_config_backup_before_rewrite' },
  // Doctor pre-fix backup write — non-destructive backup of project config.
  { file: 'doctor.ts', token: 'fsp.writeFile(backupPath', reason: 'non_destructive_doctor_pre_fix_backup' },
  // core-skill-deployment writes deployed snapshot + archive; promotion is
  // ledger-recorded via the optional opts path (Area 4.3) — project-scoped.
  { file: 'core-skill-deployment.ts', token: 'fsp.copyFile(', reason: 'skill_snapshot_archive_project_scoped' }
];

const GUARD_CALL = /\bguarded(WriteFile|Rm|Rename|Chmod|Xattr|Chflags|GlobalCodexConfigWrite|ProcessKill|PackageInstall|SkillSnapshotPromotion|Apply)\(/;

const covered = [];
const allowlisted = [];
const uncovered = [];

for (const rel of RISK_SURFACE) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split('\n');
  const base = path.basename(rel);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Real guarded mutation call → coverage evidence (the guard IS used here).
    if (GUARD_CALL.test(line) && !isComment(line)) {
      covered.push({ file: rel, line: i + 1, kind: 'guarded_call', snippet: line.trim().slice(0, 120) });
    }
    for (const { kind, re, code } of RISKY) {
      if (!re.test(line)) continue;
      if (code && isComment(line)) continue; // ignore the token inside comments
      const allow = ALLOWLIST.find((a) => base.endsWith(a.file) && line.includes(a.token));
      const entry = { file: rel, line: i + 1, kind, snippet: line.trim().slice(0, 120) };
      if (allow) allowlisted.push({ ...entry, reason: allow.reason });
      else uncovered.push(entry);
    }
  }
}

const ok = uncovered.length === 0;
const report = {
  schema: 'sks.mutation-callsite-coverage.v1',
  ok,
  risk_surface: RISK_SURFACE,
  covered,
  allowlisted,
  uncovered
};
const reportDir = path.join(root, '.sneakoscope', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'mutation-callsite-coverage.json'), `${JSON.stringify(report, null, 2)}\n`);

assertGate(ok, 'risky mutation call sites must be guarded or allowlisted-with-reason', { uncovered });
emitGate('safety:mutation-callsite-coverage', {
  covered: covered.length,
  allowlisted: allowlisted.length,
  uncovered: uncovered.length,
  risk_surface: RISK_SURFACE.length
});
