import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const scripts = [
  ['dist/scripts/blackbox-pack-install.js', 'sks.blackbox-pack-install.v1', ['npm_pack', 'npm_install_tarball', 'npx_sks_version', 'npx_sks_root_json', 'npx_sks_setup_local_only', 'npx_sks_selftest_mock', 'npx_sks_naruto_prepare', 'npx_sks_naruto_close', 'npx_sks_qa_loop_prepare', 'npx_sks_qa_loop_run_mock', 'verify_completion_proof_exists']],
  ['dist/scripts/blackbox-npx-one-shot.js', 'sks.blackbox-npx-one-shot.v1', ['npm_pack', 'npm_exec_one_shot_version', 'npm_exec_one_shot_root', 'npm_exec_one_shot_selftest']],
  ['dist/scripts/blackbox-global-shim.js', 'sks.blackbox-global-shim.v1', ['npm_pack', 'npm_install_global_prefix', 'global_shim_version', 'global_sneakoscope_version', 'global_sks_root_json']]
];

test('blackbox scripts keep package-consumer commands explicit', () => {
  for (const [file, schema, labels] of scripts) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /^#!\/usr\/bin\/env node/);
    assert.match(text, new RegExp(schema.replaceAll('.', '\\.')));
    assert.match(text, /npm_config_cache/);
    assert.match(text, /SKS_SKIP_NPM_FRESHNESS_CHECK/);
    assert.match(text, /--dry-run/);
    for (const label of labels) assert.match(text, new RegExp(label));
  }
});
