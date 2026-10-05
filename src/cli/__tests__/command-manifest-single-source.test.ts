import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COMMANDS, commandNames } from '../command-registry.js';
import { COMMAND_MANIFEST_BY_NAME, COMMAND_MANIFEST_LITE, commandManifestNames } from '../command-manifest-lite.js';

const LOADER_FIELDS = new Set(['lazy', 'packageRequiredFiles']);

test('the registry carries exactly the manifest metadata plus a loader', () => {
  assert.deepEqual(commandNames(), commandManifestNames());
  for (const name of commandManifestNames()) {
    const { name: _name, ...manifest } = COMMAND_MANIFEST_BY_NAME[name];
    const entry = Object.fromEntries(Object.entries(COMMANDS[name]).filter(([key]) => !LOADER_FIELDS.has(key)));
    assert.deepEqual(entry, manifest, `${name}: registry metadata drifted from the manifest`);
    assert.equal(typeof COMMANDS[name].lazy, 'function', `${name}: missing loader`);
    assert.ok(COMMANDS[name].packageRequiredFiles.length > 0, `${name}: missing package file`);
  }
});

test('every package file a command needs ships from dist', () => {
  for (const name of commandManifestNames()) {
    for (const file of COMMANDS[name].packageRequiredFiles) {
      assert.match(file, /^dist\/.+\.js$/, `${name}: ${file}`);
      assert.ok(fs.existsSync(path.join(process.cwd(), file)), `${name}: ${file} is not built`);
    }
  }
});

test('active-route policy and gate ownership derive from the flags, not from a second table', () => {
  for (const entry of COMMAND_MANIFEST_LITE) {
    const expectedPolicy = entry.mutatesRouteState ? 'blocked-while-active'
      : entry.readonly ? 'always'
        : entry.diagnostic ? 'diagnostic-only'
          : entry.allowedDuringActiveRoute ? 'always'
            : undefined;
    assert.equal(entry.activeRoutePolicy, expectedPolicy, `${entry.name}: activeRoutePolicy`);
    assert.equal(entry.ownsGates === true, (entry.ownedGateFiles?.length ?? 0) > 0, `${entry.name}: ownsGates`);
    if (entry.mutatesRouteState) assert.ok(entry.ownedGateFiles?.length, `${entry.name}: route mutator without gate files`);
    if (entry.readonly) assert.equal(entry.risk, 'R0', `${entry.name}: a read-only command is R0`);
  }
});
