import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts || {};
const buildManifestWriter = fs.readFileSync('dist/scripts/write-build-manifest.js', 'utf8');
const distRuntimeCheck = fs.readFileSync('dist/scripts/check-dist-runtime.js', 'utf8');

test('publish lifecycle requires the full release gate for publish readiness', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.publishConfig?.tag, 'latest');
  assert.match(scripts['feature-quality:check'], /--release/);
  assert.doesNotMatch(scripts['feature-quality:check'], /--rc/);
  assert.equal(scripts.prepack, 'npm run build');
  assert.equal(scripts['release:check'], 'npm run release:check:affected');
  assert.match(scripts['release:check:affected'], /--preset affected/);
  assert.match(scripts['release:check:full'], /--preset release --full/);
  assert.match(scripts['release:check:full'], /release-check-stamp\.js write/);
  assert.match(scripts.prepublishOnly, /npm run release:check:full/);
  assert.match(scripts.prepublishOnly, /release-check-stamp\.js verify/);
  assert.match(scripts.prepublishOnly, /--require-unpublished/);
  assert.match(scripts.prepublishOnly, /--require-publish-auth/);
  assert.match(scripts['publish:dry'], /npm run release:check:full/);
  assert.match(scripts['publish:dry'], /release-check-stamp\.js verify/);
  assert.match(scripts['publish:dry'], /--dry-run/);
  assert.doesNotMatch(scripts['publish:dry'], /--tag rc/);
  assert.doesNotMatch(scripts['publish:npm'], /--tag rc/);
  assert.equal(scripts['release:publish'], 'npm run publish:npm');
});

test('prepack rebuild keeps the release stamp stable', () => {
  assert.doesNotMatch(buildManifestWriter, /generated_at/);
  assert.match(distRuntimeCheck, /build_manifest_generated_at_non_deterministic/);
});
