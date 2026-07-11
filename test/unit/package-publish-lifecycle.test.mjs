import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts || {};
const buildManifestWriter = fs.readFileSync('dist/scripts/write-build-manifest.js', 'utf8');
const distRuntimeCheck = fs.readFileSync('dist/scripts/check-dist-runtime.js', 'utf8');
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
  assert.match(scripts['release:check:affected'], /build:incremental/);
  assert.doesNotMatch(scripts['release:check:affected'], /release-check-stamp/);
  assert.match(scripts['release:check:confidence'], /--sla 5m/);
  assert.match(scripts['release:check:full'], /--preset release --full/);
  assert.match(scripts['release:check:full'], /--report-file \.sneakoscope\/reports\/release-check-full-doctor\.json/);
  assert.doesNotMatch(scripts['release:check:full'], /\/tmp\//);
  assert.match(scripts['release:check:full'], /release-check-stamp\.js write/);
  assert.match(scripts['release:check:full'], /release-real-check\.js --skip-release-check/);
  assert.match(scripts['release:check:full'], /release-real-check\.js --skip-release-check && npm run build:clean --silent && npm run release:dist-freshness --silent && node \.\/dist\/scripts\/release-check-stamp\.js write/);
  assert.match(scripts.prepublishOnly, /prepublish-release-check-or-fast\.js/);
  assert.match(scripts.prepublishOnly, /release-check-stamp\.js verify/);
  assert.match(scripts.prepublishOnly, /--require-unpublished/);
  assert.match(scripts.prepublishOnly, /--require-publish-auth/);
  assert.doesNotMatch(scripts['publish:dry'], /release:check:full/);
  assert.match(scripts['publish:dry'], /npm run publish:prep-ignore-scripts/);
  assert.match(scripts['publish:dry'], /--dry-run/);
  assert.match(scripts['publish:dry'], /--ignore-scripts/);
  assert.doesNotMatch(scripts['publish:dry'], /--tag rc/);
  assert.doesNotMatch(scripts['publish:prep-ignore-scripts'], /prepublishOnly/);
  assert.match(scripts['publish:prep-ignore-scripts'], /publish:verify-ignore-scripts/);
  assert.match(scripts['publish:prep-ignore-scripts'], /release-check-stamp\.js verify/);
  assert.match(scripts['publish:verify-ignore-scripts'], /build:clean/);
  assert.match(scripts['publish:verify-ignore-scripts'], /release:version-truth/);
  assert.match(scripts['publish:verify-ignore-scripts'], /publish:packlist-performance/);
  assert.match(scripts['publish:verify-ignore-scripts'], /package-published-contract-check\.js/);
  assert.match(scripts['publish:prep-ignore-scripts'], /release-registry-check\.js --require-unpublished --require-publish-auth/);
  assert.match(scripts['publish:verify-ignore-scripts'], /publish-tag:check/);
  assert.match(scripts['publish:ignore-scripts'], /npm run publish:prep-ignore-scripts/);
  assert.match(scripts['publish:ignore-scripts'], /--ignore-scripts/);
  assert.doesNotMatch(scripts['publish:ignore-scripts'], /--tag rc/);
  assert.equal(scripts['publish:npm'], undefined);
  assert.equal(scripts['release:publish'], undefined);
});

test('prepack rebuild keeps the release stamp stable', () => {
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
