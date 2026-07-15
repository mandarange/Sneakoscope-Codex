import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const scripts = [
  ['dist/scripts/blackbox-pack-install.js', 'sks.blackbox-pack-install.v1', ['npm_pack', 'npm_install_tarball', 'npx_sks_version', 'npx_sks_root_json', 'npx_sks_setup_local_only', 'npx_sks_selftest_mock', 'npx_sks_run_execute_mock', 'npx_sks_naruto_prepare', 'npx_sks_naruto_close', 'npx_sks_qa_loop_prepare', 'npx_sks_qa_loop_run_mock', 'verify_completion_proof_exists']],
  ['dist/scripts/blackbox-npx-one-shot.js', 'sks.blackbox-npx-one-shot.v1', ['npm_pack', 'npm_exec_one_shot_version', 'npm_exec_one_shot_root', 'npm_exec_one_shot_selftest']],
  ['dist/scripts/blackbox-global-shim.js', 'sks.blackbox-global-shim.v1', ['npm_pack', 'npm_install_global_prefix', 'global_shim_version', 'global_sneakoscope_version', 'global_sks_root_json']]
];

for (const [file, schema, labels] of scripts) {
  test(`${file} exposes a dry-run blackbox report`, () => {
    const result = spawnSync(process.execPath, [file, '--dry-run', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
    });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.schema, schema);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dry_run, true);
    assert.deepEqual(parsed.steps.map((step) => step.label), labels);
  });
}
