import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const releaseGates = JSON.parse(fs.readFileSync('release-gates.v2.json', 'utf8'));
const scripts = pkg.scripts || {};
const buildManifestWriter = fs.readFileSync('dist/scripts/write-build-manifest.js', 'utf8');
const distRuntimeCheck = fs.readFileSync('dist/scripts/check-dist-runtime.js', 'utf8');
const prepublishVerifier = fs.readFileSync('dist/scripts/prepublish-release-check-or-fast.js', 'utf8');
const npmrc = fs.readFileSync('.npmrc', 'utf8');

test('publish lifecycle separates full release stamps from lifecycle-disabled publish readiness', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.publishConfig?.tag, 'latest');
  assert.match(npmrc, /^tag=latest$/m);
  assert.match(scripts['feature-quality:check'], /--release/);
  assert.doesNotMatch(scripts['feature-quality:check'], /--rc/);
  assert.equal(scripts.prepack, 'npm run build');
  assert.equal(scripts.check, undefined);
  assert.match(scripts['build:incremental'], /tsc -p tsconfig\.json/);
  assert.equal(scripts['release:check'], 'npm run release:check:affected');
  assert.match(scripts['release:check:affected'], /--preset affected/);
  assert.match(scripts['release:check:affected'], /release:ensure-build/);
  assert.doesNotMatch(scripts['release:check:affected'], /build:incremental/);
  assert.doesNotMatch(scripts['release:check:affected'], /release-check-stamp/);
  assert.match(scripts['release:check:confidence'], /--sla 5m/);
  assert.match(scripts['release:check:confidence'], /release:ensure-build/);
  assert.doesNotMatch(scripts['release:check:confidence'], /build:incremental/);
  assert.match(scripts['release:ensure-build'], /release-dist-freshness-check\.js/);
  assert.match(scripts['release:ensure-build'], /dist\/scripts\/release-dist-freshness-check\.js/);
  assert.match(scripts['release:check:full'], /--preset release --full/);
  assert.match(scripts['release:check:full'], /--report-file \.sneakoscope\/reports\/release-check-full-doctor\.json/);
  assert.doesNotMatch(scripts['release:check:full'], /\/tmp\//);
  assert.match(scripts['release:check:full'], /release-check-stamp\.js write/);
  assert.match(scripts['release:check:full'], /release-real-check\.js --skip-release-check/);
  assert.equal(count(scripts['release:check:full'], 'build:clean'), 1);
  assert.equal(count(scripts['release:check:full'], 'npm test --silent'), 1);
  assert.ok(scripts['release:check:full'].indexOf('doctor --fix') < scripts['release:check:full'].indexOf('build:clean'));
  assert.ok(scripts['release:check:full'].indexOf('build:clean') < scripts['release:check:full'].indexOf('npm test --silent'));
  assert.match(scripts['release:check:full'], /release-real-check\.js --skip-release-check && npm run release:dist-freshness --silent && node \.\/dist\/scripts\/release-check-stamp\.js write/);
  assert.match(scripts.prepublishOnly, /prepublish-release-check-or-fast\.js/);
  assert.match(scripts.prepublishOnly, /--block-lifecycle-publish/);
  assert.doesNotMatch(scripts.prepublishOnly, /publish:packlist-performance|release-registry-check/);
  assert.doesNotMatch(prepublishVerifier, /runReleaseCheck|npmCmd/);
  assert.doesNotMatch(prepublishVerifier, /SKS_PREPUBLISH_RELEASE_CHECK_CMD/);
  assert.match(prepublishVerifier, /current authoritative full-release stamp/);
  assert.doesNotMatch(scripts['publish:dry'], /release:check:full/);
  assert.match(scripts['publish:dry'], /npm run publish:prep-ignore-scripts/);
  assert.match(scripts['publish:dry'], /npm pack --dry-run --ignore-scripts --json/);
  assert.match(scripts['publish:dry'], /--ignore-scripts/);
  assert.doesNotMatch(Object.values(scripts).join('\n'), /npm\s+publish\s+--dry-run/);
  assert.doesNotMatch(scripts['publish:dry'], /--tag rc/);
  assert.doesNotMatch(scripts['publish:prep-ignore-scripts'], /prepublishOnly/);
  assert.match(scripts['publish:prep-ignore-scripts'], /publish:verify-ignore-scripts/);
  assert.equal(count(scripts['publish:prep-ignore-scripts'], 'release-check-stamp.js verify'), 2);
  const prep = scripts['publish:prep-ignore-scripts'];
  assert.ok(prep.indexOf('release-check-stamp.js verify') < prep.indexOf('publish:verify-ignore-scripts'));
  assert.ok(prep.indexOf('publish:verify-ignore-scripts') < prep.indexOf('release-registry-check.js'));
  assert.ok(prep.lastIndexOf('release-check-stamp.js verify') > prep.indexOf('publish:verify-ignore-scripts'));
  assert.doesNotMatch(scripts['publish:verify-ignore-scripts'], /build:incremental/);
  assert.doesNotMatch(scripts['publish:verify-ignore-scripts'], /build:clean/);
  assert.doesNotMatch(scripts['publish:verify-ignore-scripts'], /npm test/);
  assert.doesNotMatch(scripts['publish:prep-ignore-scripts'], /npm test/);
  assert.doesNotMatch(scripts['publish:verify-ignore-scripts'], /typecheck/);
  assert.match(scripts['publish:verify-ignore-scripts'], /release:dist-freshness/);
  assert.match(scripts['publish:verify-ignore-scripts'], /release:version-truth/);
  assert.match(scripts['publish:verify-ignore-scripts'], /publish:packlist-performance/);
  assert.match(scripts['publish:verify-ignore-scripts'], /package-published-contract-check\.js/);
  assert.match(scripts['publish:prep-ignore-scripts'], /release-registry-check\.js --require-unpublished --require-publish-auth --require-pack-proof/);
  assert.match(scripts['publish:verify-ignore-scripts'], /publish-tag:check/);
  assert.match(scripts['publish:ignore-scripts'], /npm run publish:prep-ignore-scripts/);
  assert.match(scripts['publish:ignore-scripts'], /--ignore-scripts/);
  assert.doesNotMatch(scripts['publish:ignore-scripts'], /--tag rc/);
  assert.equal(scripts['publish:npm'], undefined);
  assert.equal(scripts['release:publish'], undefined);
  const officialSubagentGates = releaseGates.gates.filter((gate) => gate.command === 'node ./dist/scripts/official-subagent-workflow-check.js');
  assert.deepEqual(officialSubagentGates.map((gate) => gate.id), ['naruto:canonical-stop-gate']);
  const packlistGate = releaseGates.gates.find((gate) => gate.id === 'publish:packlist-performance');
  assert.ok(packlistGate, 'publish:packlist-performance gate must exist');
  assert.equal(packlistGate.cache?.enabled, true, 'packlist proof may be reused only while its required artifacts remain current');
  const runtimeManifests = {
    'release-gates.v2.json': 'sks.release-gates.v2',
    'infra-harness-gates.json': 'sks.infra-harness-gates.v1',
    'runtime-required-scripts.json': 'sks.runtime-required-scripts.v1'
  };
  for (const [manifest, schema] of Object.entries(runtimeManifests)) {
    assert.ok(pkg.files.includes(manifest), `installed package must include ${manifest}`);
    assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).schema, schema);
  }
});

test('lifecycle-disabled publish prep fails before registry or build work when the full-release stamp is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-publish-prep-stamp-'));
  const stampPath = path.join(dir, 'missing-release-check-stamp.json');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', 'publish:prep-ignore-scripts', '--silent'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      SKS_RELEASE_STAMP_PATH: stampPath,
      SKS_SKIP_REGISTRY_NETWORK_CHECK: '1'
    }
  });

  assert.notEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /missing release:check stamp/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /publish auth check cannot run|bin executable|dist-freshness/);
  assert.equal(fs.existsSync(stampPath), false);
});

test('plain lifecycle publish is blocked before the prepack rebuild can invalidate authorization', () => {
  const result = spawnSync(process.execPath, ['./dist/scripts/prepublish-release-check-or-fast.js', '--block-lifecycle-publish'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Lifecycle-enabled npm publish is unsupported/);
  assert.match(result.stderr, /publish:prep-ignore-scripts/);
  assert.doesNotMatch(buildManifestWriter, /generated_at/);
  assert.match(distRuntimeCheck, /build_manifest_generated_at_non_deterministic/);
});

test('build-dist CommonJS conversion is byte-idempotent across incremental rebuilds', () => {
  const files = ['dist/bin/sks-dispatch.js', 'dist/bin/fast-inline.js'];
  runBuildDist();
  const first = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
  runBuildDist();
  const second = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
  assert.deepEqual(second, first);
  assert.equal(count(first[files[0]], 'exports.runSks = runSks;'), 1);
  for (const name of ['rootJsonFastInline', 'doctorJsonFastInline', 'narutoHelpJsonFastInline', 'hookUserPromptSubmitPerfInline']) {
    assert.equal(count(first[files[1]], `exports.${name} = ${name};`), 1);
  }
});

function runBuildDist() {
  const result = spawnSync(process.execPath, ['./dist/scripts/build-dist.js'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function count(text, needle) {
  return text.split(needle).length - 1;
}
