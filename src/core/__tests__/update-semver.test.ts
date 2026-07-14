import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSemVer,
  extractSemVer,
  isSemVerUpdateAvailable,
  parseSemVer
} from '../update/semver.js';

test('SemVer SSOT orders stable after prerelease and ignores build metadata', () => {
  assert.equal(compareSemVer('6.3.0', '6.3.0-rc.1'), 1);
  assert.equal(compareSemVer('6.3.0+build.9', '6.3.0+build.1'), 0);
  assert.equal(isSemVerUpdateAvailable('6.3.0', '6.3.0-rc.1'), true);
});

test('SemVer SSOT implements prerelease identifier precedence', () => {
  const ordered = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0'
  ];
  for (let index = 1; index < ordered.length; index += 1) {
    assert.equal(compareSemVer(ordered[index - 1], ordered[index]), -1);
    assert.equal(compareSemVer(ordered[index], ordered[index - 1]), 1);
  }
});

test('malformed versions fail closed instead of implying an update', () => {
  for (const value of ['6.03.0', '6.3', '6.3.0-01', 'v6.3.0', '6.3.0+bad..meta', '']) {
    assert.equal(parseSemVer(value), null, value);
    assert.equal(compareSemVer(value, '6.2.0'), null, value);
    assert.equal(isSemVerUpdateAvailable(value, '6.2.0'), false, value);
  }
});

test('version extraction accepts bounded command output but rejects embedded tokens', () => {
  assert.equal(extractSemVer('sks 6.3.0-rc.2+sha.abc\n'), '6.3.0-rc.2+sha.abc');
  assert.equal(extractSemVer('prefix6.3.0suffix'), null);
});
