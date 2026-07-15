import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  findRemoteMachine,
  remoteMachineRegistryPath,
  resolveAllowedProjectRoot,
  validateAllowedRoot,
  validateRemoteMachineRegistry,
  validateSshAlias
} from '../machine-registry.js';
import { remoteSessionIndexPath, validateRemoteSessionIndex } from '../session-index.js';
import { remoteReadiness } from '../readiness.js';
import type { RemoteMachineRegistryV1, RemoteMachineV1 } from '../types.js';

async function tempRoot(prefix: string): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('machine registry accepts bounded SSH aliases and rejects host strings and broad roots', () => {
  assert.equal(validateSshAlias('sks-mac-studio'), true);
  assert.equal(validateSshAlias('user@host'), false);
  assert.equal(validateSshAlias('-oProxyCommand=bad'), false);
  assert.equal(validateAllowedRoot('/'), 'filesystem_root_forbidden');
  assert.equal(validateAllowedRoot('/Users/example'), 'home_root_forbidden');
  const valid = validateRemoteMachineRegistry({
    schema: 'sks.remote-machines.v1',
    machines: [{
      id: 'mac-studio',
      display_name: 'Mac Studio',
      transport: 'ssh-stdio',
      ssh_alias: 'sks-mac-studio',
      allowed_roots: ['/Users/example/src'],
      enabled: true
    }]
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.registry?.machines[0]?.ssh_alias, 'sks-mac-studio');
  assert.throws(() => findRemoteMachine(valid.registry!, 'unknown'), /remote_machine_unknown_or_disabled/);
});

test('machine registry and project session index use canonical paths and fail closed on duplicate or outside targets', () => {
  assert.equal(
    remoteMachineRegistryPath('/Users/example/.sneakoscope-global'),
    '/Users/example/.sneakoscope-global/remote/machines.json'
  );
  assert.equal(
    remoteSessionIndexPath('/Users/example/src/repo'),
    '/Users/example/src/repo/.sneakoscope/remote/session-index.json'
  );
  const registry: RemoteMachineRegistryV1 = {
    schema: 'sks.remote-machines.v1',
    machines: [{
      id: 'mac', display_name: 'Mac', transport: 'ssh-stdio', ssh_alias: 'sks-mac',
      allowed_roots: ['/Users/example/src'], enabled: true
    }]
  };
  const valid = validateRemoteSessionIndex({
    schema: 'sks.remote-session-index.v1',
    targets: [{ machine_id: 'mac', project_id: 'repo', project_root: '/Users/example/src/repo' }]
  }, registry);
  assert.equal(valid.ok, true);
  const invalid = validateRemoteSessionIndex({
    schema: 'sks.remote-session-index.v1',
    targets: [
      { machine_id: 'mac', project_id: 'repo', project_root: '/Users/example/src/repo' },
      { machine_id: 'mac', project_id: 'repo', project_root: '/Users/example/outside' }
    ]
  }, registry);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.includes('target_1:duplicate_machine_project'));
  assert.ok(invalid.issues.includes('target_1:project_root_not_allowlisted'));
});

test('realpath allowlist accepts in-root projects and refuses symlink escape', async () => {
  const root = await tempRoot('sks-remote-roots-');
  const allowed = path.join(root, 'allowed');
  const project = path.join(allowed, 'repo');
  const outside = path.join(root, 'outside');
  await fsp.mkdir(project, { recursive: true });
  await fsp.mkdir(outside, { recursive: true });
  const link = path.join(allowed, 'escape');
  await fsp.symlink(outside, link);
  const machine: RemoteMachineV1 = {
    id: 'mac', display_name: 'Mac', transport: 'ssh-stdio', ssh_alias: 'sks-mac', allowed_roots: [allowed], enabled: true
  };
  assert.equal(await resolveAllowedProjectRoot(machine, project), await fsp.realpath(project));
  await assert.rejects(resolveAllowedProjectRoot(machine, link), /not_allowlisted_or_symlink_escape/);
});

test('readiness emits the exact v1 shape and keeps machine allowlist separate from official Remote', async () => {
  const root = await tempRoot('sks-remote-ready-');
  await fsp.writeFile(path.join(root, '.git'), 'gitdir: /tmp/common/worktrees/repo\n');
  const machine: RemoteMachineV1 = {
    id: 'mac', display_name: 'Mac', transport: 'ssh-stdio', ssh_alias: 'sks-mac', allowed_roots: [root], enabled: true
  };
  const result = await remoteReadiness({
    root,
    machine,
    dependencies: {
      platform: 'darwin',
      homeDir: '/Users/example',
      packageVersion: '6.3.0',
      findExecutable: async () => '/usr/local/bin/codex',
      pathExists: async (file) => file === '/Applications/ChatGPT.app',
      run: async (_command, args) => {
        const joined = args.join(' ');
        if (joined === 'rev-parse --is-inside-work-tree') return { code: 0, stdout: 'true\n', stderr: '' };
        if (joined === 'rev-parse --abbrev-ref HEAD') return { code: 0, stdout: 'release/6.3.0\n', stderr: '' };
        if (joined.startsWith('status ')) return { code: 0, stdout: '', stderr: '' };
        return { code: 1, stdout: '', stderr: '' };
      },
      probeMcp: async () => ({ effective_count: 3, failed_count: 0 }),
      proofSurfacesReady: async () => true,
      awakeHint: async () => 'sleep_prevention_assertion_present',
      resolveAllowedRoot: async (_machine, candidate) => candidate
    }
  });
  assert.deepEqual(Object.keys(result), ['schema', 'ok', 'host', 'project', 'mcp', 'sks', 'blockers', 'warnings']);
  assert.equal(result.schema, 'sks.remote-readiness.v1');
  assert.equal(result.ok, true);
  assert.equal(result.project.worktree, true);
  assert.equal(result.project.allowed, true);
  assert.equal(result.mcp.effective_count, 3);
  assert.equal(result.warnings.includes('ssh_machine_allowlist_not_checked'), false);
});

test('readiness fails closed when app, CLI, git, MCP, proof, or allowlist readiness is missing', async () => {
  const root = await tempRoot('sks-remote-blocked-');
  const machine: RemoteMachineV1 = {
    id: 'mac', display_name: 'Mac', transport: 'ssh-stdio', ssh_alias: 'sks-mac', allowed_roots: [path.join(root, 'allowed')], enabled: true
  };
  const result = await remoteReadiness({
    root,
    machine,
    dependencies: {
      platform: 'linux',
      findExecutable: async () => null,
      pathExists: async () => false,
      run: async () => ({ code: 1, stdout: '', stderr: '' }),
      probeMcp: async () => ({ effective_count: 0, failed_count: 1 }),
      proofSurfacesReady: async () => false,
      awakeHint: async () => null,
      resolveAllowedRoot: async () => { throw new Error('outside'); }
    }
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, [
    'codex_app_not_found',
    'codex_cli_not_found',
    'project_not_git_repo',
    'project_root_not_allowlisted',
    'mcp_health_failed',
    'sks_proof_surfaces_not_ready'
  ]);
});
