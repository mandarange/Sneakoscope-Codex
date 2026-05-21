import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts || {};
const buildManifestWriter = fs.readFileSync('scripts/write-build-manifest.mjs', 'utf8');
const distRuntimeCheck = fs.readFileSync('scripts/check-dist-runtime.mjs', 'utf8');

test('publish lifecycle runs the expensive release gate only once', () => {
  assert.equal(pkg.version, '1.11.0');
  assert.equal(pkg.publishConfig?.tag, 'latest');
  assert.match(scripts['feature-quality:check'], /--release/);
  assert.doesNotMatch(scripts['feature-quality:check'], /--rc/);
  assert.equal(scripts.prepack, 'npm run build');
  assert.match(scripts['release:check'], /release-check-stamp\.mjs write/);
  assert.match(scripts.prepublishOnly, /release-check-stamp\.mjs verify/);
  assert.doesNotMatch(scripts.prepublishOnly, /npm run release:check/);
  assert.match(scripts.prepublishOnly, /--require-unpublished/);
  assert.doesNotMatch(scripts['publish:dry'], /release:check/);
  assert.match(scripts['publish:dry'], /--dry-run/);
  assert.doesNotMatch(scripts['publish:dry'], /--tag rc/);
  assert.doesNotMatch(scripts['publish:npm'], /--tag rc/);
  assert.equal(scripts['release:publish'], 'npm run publish:npm');
});

test('prepack rebuild keeps the release stamp stable', () => {
  assert.doesNotMatch(buildManifestWriter, /generated_at/);
  assert.match(distRuntimeCheck, /build_manifest_generated_at_non_deterministic/);
});
