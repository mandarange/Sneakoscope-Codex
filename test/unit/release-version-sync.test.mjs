import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('stable release metadata and runtime versions stay synchronized', () => {
  const expected = pkg.version;
  assert.equal(expected, '1.16.0');
  assert.doesNotMatch(expected, /-/);
  assert.equal(pkg.publishConfig?.tag, 'latest');

  const versions = [
    ['package-lock.json version', lock.version],
    ['package-lock root version', lock.packages?.['']?.version],
    ['src/core/version.ts', read('src/core/version.ts').match(/PACKAGE_VERSION = ['"]([^'"]+)['"]/)?.[1]],
    ['src/core/fsx.ts', read('src/core/fsx.ts').match(/PACKAGE_VERSION = ['"]([^'"]+)['"]/)?.[1]],
    ['src/bin/sks.ts', read('src/bin/sks.ts').match(/FAST_PACKAGE_VERSION = ['"]([^'"]+)['"]/)?.[1]],
    ['crates/sks-core/Cargo.toml', read('crates/sks-core/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1]],
    ['crates/sks-core/Cargo.lock', read('crates/sks-core/Cargo.lock').match(/\[\[package\]\]\nname = "sks-core"\nversion = "([^"]+)"/)?.[1]],
    ['crates/sks-core/src/main.rs', read('crates/sks-core/src/main.rs').match(/println!\("sks-rs ([^"]+)"\)/)?.[1]]
  ];

  assert.deepEqual(
    versions.filter(([, version]) => version !== expected),
    [],
    versions.map(([label, version]) => `${label}: ${version || 'missing'}`).join('\n')
  );
});
