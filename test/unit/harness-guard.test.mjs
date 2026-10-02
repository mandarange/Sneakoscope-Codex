import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  checkHarnessModification,
  classifyHarnessPayload,
  harnessGuardBlockReason
} from '../../dist/core/harness-guard.js';

const policy = {
  enabled: true,
  locked: true,
  engine_source_exception: false,
  protected_files: ['.codex/config.toml', '.sneakoscope/harness-guard.json'],
  protected_dirs: ['.agents/skills', '.codex/agents']
};

test('harness guard allows deleting mission artifacts even when their content mentions package manifests', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-harness-mission-'));
  const payload = {
    tool_name: 'apply_patch',
    command: `*** Begin Patch
*** Delete File: .sneakoscope/missions/M-fixture/agents/agent-proof-evidence.json
-{"command":"npm publish ./repo --ignore-scripts --dry-run","path":"package.json","package":"sneakoscope@4.7.0",".codex/config.toml":"mentioned as evidence only"}
*** End Patch`
  };

  const classified = classifyHarnessPayload(root, payload, policy);
  assert.equal(classified.writeIntent, true);
  assert.equal(classified.block, false);
  assert.deepEqual(classified.reasons, []);
});

test('harness guard still blocks actual Sneakoscope package manifest edits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-harness-package-'));
  const payload = {
    tool_name: 'apply_patch',
    command: `*** Begin Patch
*** Update File: package.json
@@
-  "name": "sneakoscope",
+  "name": "sneakoscope",
*** End Patch`
  };

  const classified = classifyHarnessPayload(root, payload, policy);
  assert.equal(classified.block, true);
  assert.ok(classified.reasons.includes('package_manifest_sneakoscope_edit_blocked'));
});

test('harness guard blocks protected harness target paths but not runtime mission paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-harness-target-'));

  const protectedTarget = classifyHarnessPayload(root, {
    tool_name: 'apply_patch',
    command: `*** Begin Patch
*** Update File: .codex/config.toml
@@
-model = "old"
+model = "new"
*** End Patch`
  }, policy);
  assert.equal(protectedTarget.block, true);
  assert.ok(protectedTarget.matches.includes('.codex/config.toml'));

  const missionTarget = classifyHarnessPayload(root, {
    tool_name: 'shell',
    command: 'rm -rf .sneakoscope/missions/M-fixture'
  }, policy);
  assert.equal(missionTarget.writeIntent, true);
  assert.equal(missionTarget.block, false);
});

test('harness guard classifies sks doctor --fix as blocked maintenance', () => {
  const root = '/tmp/sks-harness-doctor-classify';
  const classified = classifyHarnessPayload(root, {
    tool_name: 'Shell',
    command: 'sks doctor --fix'
  }, policy);
  assert.equal(classified.block, true);
  assert.ok(classified.reasons.includes('sks_doctor_fix_blocked'));
  assert.match(harnessGuardBlockReason({ reasons: ['sks_doctor_fix_blocked'] }), /Ask the user to run `sks doctor --fix`/);
});

test('harness guard blocks sks doctor --fix even under engine source exception', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-harness-doctor-engine-'));
  await fs.mkdir(path.join(root, '.sneakoscope'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'harness-guard.json'), JSON.stringify({
    schema_version: 1,
    enabled: true,
    locked: false,
    engine_source_exception: true,
    fingerprints: {}
  }));

  const blocked = await checkHarnessModification(root, {
    tool_name: 'Shell',
    command: 'cd /tmp && sks doctor --fix --json'
  });
  assert.equal(blocked.action, 'block');
  assert.deepEqual(blocked.reasons, ['sks_doctor_fix_blocked']);

  const allowedRead = await checkHarnessModification(root, {
    tool_name: 'Shell',
    command: 'sks doctor --json'
  });
  assert.equal(allowedRead.action, 'allow');
});

// Real PreToolUse key set, as recorded in .sneakoscope/state/harness-guard.jsonl.
function preToolUse(toolName, toolInput, extra = {}) {
  return {
    session_id: '019fd710-d952-7000-8000-000000000001',
    turn_id: 'turn-1',
    transcript_path: '/tmp/rollout.jsonl',
    cwd: '/tmp/repo',
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.6',
    permission_mode: 'default',
    tool_name: toolName,
    tool_use_id: 'call-1',
    tool_input: toolInput,
    ...extra
  };
}

test('harness guard sees filesystem MCP writes to protected harness paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-harness-mcp-'));

  const written = classifyHarnessPayload(root, preToolUse('mcp__filesystem__write_file', { path: path.join(root, '.codex', 'config.toml'), content: 'model = "x"\n' }), policy);
  assert.equal(written.writeIntent, true);
  assert.equal(written.block, true);
  assert.ok(written.reasons.includes('protected_harness_path_write_blocked'));
  assert.deepEqual(written.matches, ['.codex/config.toml']);

  const edited = classifyHarnessPayload(root, preToolUse('mcp__filesystem__edit_file', { path: '.agents/skills/sks-naruto/SKILL.md', edits: [{ oldText: 'a', newText: 'b' }], dryRun: false }), policy);
  assert.equal(edited.block, true);
  assert.deepEqual(edited.matches, ['.agents/skills']);

  // move_file carries both ends; moving a protected file away is a write to it.
  const moved = classifyHarnessPayload(root, preToolUse('mcp__filesystem__move_file', { source: '.codex/config.toml', destination: 'backup/config.toml' }), policy);
  assert.equal(moved.block, true);
  assert.deepEqual(moved.matches, ['.codex/config.toml']);

  const manifest = classifyHarnessPayload(root, preToolUse('mcp__filesystem__edit_file', { path: 'package.json', edits: [{ oldText: '"sneakoscope": "1.0.0"', newText: '"sneakoscope": "2.0.0"' }] }), policy);
  assert.ok(manifest.reasons.includes('package_manifest_sneakoscope_edit_blocked'));

  // Ordinary project files and read-only filesystem tools stay allowed.
  const ordinary = classifyHarnessPayload(root, preToolUse('mcp__filesystem__write_file', { path: 'src/app.ts', content: 'export {};\n' }), policy);
  assert.equal(ordinary.writeIntent, true);
  assert.equal(ordinary.block, false);
  const read = classifyHarnessPayload(root, preToolUse('mcp__filesystem__read_text_file', { path: '.codex/config.toml' }), policy);
  assert.equal(read.writeIntent, false);
  assert.equal(read.block, false);
  assert.equal(classifyHarnessPayload(root, preToolUse('mcp__filesystem__list_allowed_directories', {}), policy).writeIntent, false);
});

test('harness guard blocks sks doctor --fix only as an executed shell command', async () => {
  const root = '/tmp/sks-harness-doctor-exec';
  const blocksDoctorFix = (payload) => classifyHarnessPayload(root, payload, policy).reasons.includes('sks_doctor_fix_blocked');

  for (const command of [
    'sks doctor --fix',
    'cd /tmp/repo && sks doctor --fix --json',
    'sks doctor --json; sks doctor --fix',
    'FOO=1 sudo -n sks doctor --fix',
    '/Users/weklem/.nvm/versions/node/v24.0.2/bin/sks doctor --fix',
    'node dist/bin/sks.js doctor --fix',
    'npx -y -p sneakoscope sks doctor --fix',
    'echo done | sks doctor --fix'
  ]) assert.equal(blocksDoctorFix(preToolUse('Bash', { command })), true, command);

  // Shell tools that name the command differently, or carry it at the payload top level.
  assert.equal(blocksDoctorFix(preToolUse('exec_command', { cmd: 'sks doctor --fix', workdir: '/tmp/repo' })), true);
  assert.equal(blocksDoctorFix({ tool_name: 'shell', command: 'sks doctor --fix' }), true);

  // Text that only mentions the command: patches, goals, searches, heredoc documents.
  assert.equal(blocksDoctorFix(preToolUse('apply_patch', {
    command: '*** Begin Patch\n*** Update File: README.md\n@@\n ```sh\n npm i -g sneakoscope\n+sks bootstrap --yes\n sks doctor --fix\n ```\n*** End Patch'
  })), false);
  assert.equal(blocksDoctorFix(preToolUse('apply_patch', {
    command: '*** Begin Patch\n*** Update File: CHANGELOG.md\n@@\n+- `sks doctor --fix` no longer rewrites the lock file.\n*** End Patch'
  }, { agent_id: '019fd711-aaaa-7000-8000-000000000002', agent_type: 'worker' })), false);
  assert.equal(blocksDoctorFix(preToolUse('create_goal', { objective: 'Never run sks doctor --fix from an agent.' })), false);
  assert.equal(blocksDoctorFix(preToolUse('mcp__filesystem__write_file', { path: 'docs/repair.md', content: 'Run:\nsks doctor --fix\n' })), false);
  assert.equal(blocksDoctorFix(preToolUse('Bash', {
    command: 'rg -n "reconcileDoctorSkills|content_digest_mismatch|sks doctor --fix|doctor.*skill|doctorFix" src/commands src/core'
  })), false);
  assert.equal(blocksDoctorFix(preToolUse('Bash', {
    command: "python3 - <<'PY'\nfrom pathlib import Path\nPath('README.md').write_text('''# SKS\n\nsks doctor --fix\n''')\nPY"
  })), false);
  assert.equal(blocksDoctorFix(preToolUse('Bash', { command: 'echo "sks doctor --fix"' })), false);
  assert.equal(blocksDoctorFix(preToolUse('Bash', { command: 'sks doctor --json && git diff --fix-whitespace' })), false);
  assert.equal(blocksDoctorFix(preToolUse('Bash', { command: 'sks doctor --json # then sks doctor --fix' })), false);

  // A real command after a heredoc body is still seen.
  assert.equal(blocksDoctorFix(preToolUse('Bash', { command: "cat <<'EOF' > notes.txt\nsks doctor --fix\nEOF\nsks doctor --fix" })), true);
});

test('harness guard classifies the other maintenance commands per executed command too', () => {
  const root = '/tmp/sks-harness-maintenance-exec';
  const reasonsOf = (command) => classifyHarnessPayload(root, preToolUse('Bash', { command }), policy).reasons;

  assert.ok(reasonsOf('sks setup --yes').includes('sks_harness_maintenance_command_blocked'));
  assert.ok(reasonsOf('sks init').includes('sks_harness_maintenance_command_blocked'));
  assert.ok(reasonsOf('sks fix-path').includes('sks_harness_maintenance_command_blocked'));
  assert.ok(reasonsOf('sks context7 setup').includes('sks_context7_setup_blocked'));
  assert.ok(reasonsOf('npm uninstall -g sneakoscope').includes('sneakoscope_uninstall_blocked'));
  assert.ok(reasonsOf('pnpm remove sneakoscope').includes('sneakoscope_uninstall_blocked'));

  assert.deepEqual(reasonsOf('rg -n "bootstrap|sks setup|sks init" docs README.md'), []);
  assert.deepEqual(reasonsOf('sks doctor --json'), []);
  assert.deepEqual(reasonsOf('npm uninstall left-pad'), []);
  assert.deepEqual(reasonsOf('git log --oneline -- src/commands/setup.ts'), []);
});

test('harness guard does not block an engine-source apply_patch that only documents sks doctor --fix', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-harness-doctor-doc-'));
  await fs.mkdir(path.join(root, '.sneakoscope'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'harness-guard.json'), JSON.stringify({
    schema_version: 1,
    enabled: true,
    locked: false,
    engine_source_exception: true,
    fingerprints: {}
  }));

  const allowed = await checkHarnessModification(root, preToolUse('apply_patch', {
    command: '*** Begin Patch\n*** Update File: README.md\n@@\n ```sh\n sks doctor --fix\n+sks bootstrap --yes\n ```\n*** End Patch'
  }));
  assert.equal(allowed.action, 'allow');
  await assert.rejects(fs.access(path.join(root, '.sneakoscope', 'state', 'harness-guard.jsonl')));

  const blocked = await checkHarnessModification(root, preToolUse('exec_command', { cmd: 'sks doctor --fix' }));
  assert.equal(blocked.action, 'block');
  assert.deepEqual(blocked.reasons, ['sks_doctor_fix_blocked']);
});
