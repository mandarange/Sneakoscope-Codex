import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveOfficialCodexPackageRuntimeAtPackageRoot } from '../resolve-codex-runtime.js';

const linuxOnly = process.platform === 'linux' && process.arch === 'x64'
  ? undefined
  : { skip: 'fixture binary is intentionally Linux x64-only' };

test('official runtime resolves a nested npm layout', linuxOnly || {}, async () => {
  await withFixture('nested', async ({ packageRoot }) => {
    const resolved = await resolveOfficialCodexPackageRuntimeAtPackageRoot(packageRoot, 'nested-layout-test');
    assert.equal(resolved.ok, true);
    assert.equal(resolved.identity?.requestedBy, 'nested-layout-test');
    assert.equal(resolved.identity?.version, '1.2.3');
    assert.equal(resolved.identity?.trusted, true);
    assert.equal(resolved.identity?.trust_basis, 'official_package_pin');
  });
});

test('official runtime resolves a hoisted parent node_modules layout', linuxOnly || {}, async () => {
  await withFixture('hoisted', async ({ packageRoot, nativePackageRoot }) => {
    const resolved = await resolveOfficialCodexPackageRuntimeAtPackageRoot(packageRoot, 'hoisted-layout-test');
    assert.equal(resolved.ok, true);
    assert.equal(resolved.identity?.requestedBy, 'hoisted-layout-test');
    assert.equal(resolved.identity?.packageRoot, await fsp.realpath(nativePackageRoot));
  });
});

test('official runtime does not search a parent node_modules for an uninstalled package root', linuxOnly || {}, async () => {
  await withFixture('outside-node-modules', async ({ packageRoot }) => {
    const resolved = await resolveOfficialCodexPackageRuntimeAtPackageRoot(packageRoot, 'outside-layout-test');
    assert.equal(resolved.ok, false);
    assert.deepEqual(resolved.blockers, ['codex_sdk_official_runtime_package_not_found']);
  });
});

test('official runtime rejects a native package symlink that escapes node_modules', linuxOnly || {}, async () => {
  await withFixture('hoisted', async ({ packageRoot, nativePackageRoot, tempRoot }) => {
    const escapedNativeRoot = path.join(tempRoot, 'escaped-native-package');
    await fsp.cp(nativePackageRoot, escapedNativeRoot, { recursive: true });
    await fsp.rm(nativePackageRoot, { recursive: true, force: true });
    await fsp.symlink(escapedNativeRoot, nativePackageRoot, 'dir');

    const resolved = await resolveOfficialCodexPackageRuntimeAtPackageRoot(packageRoot, 'symlink-escape-test');
    assert.equal(resolved.ok, false);
    assert.deepEqual(resolved.blockers, ['codex_sdk_official_runtime_package_path_mismatch']);
  });
});

test('official runtime rejects an SDK dependency version mismatch', linuxOnly || {}, async () => {
  await withFixture('nested', async ({ packageRoot, nodeModulesRoot }) => {
    const sdkManifestPath = path.join(nodeModulesRoot, '@openai', 'codex-sdk', 'package.json');
    const sdkManifest = JSON.parse(await fsp.readFile(sdkManifestPath, 'utf8')) as { dependencies: Record<string, string> };
    sdkManifest.dependencies['@openai/codex'] = '9.9.9';
    await fsp.writeFile(sdkManifestPath, `${JSON.stringify(sdkManifest)}\n`);

    const resolved = await resolveOfficialCodexPackageRuntimeAtPackageRoot(packageRoot, 'version-mismatch-test');
    assert.equal(resolved.ok, false);
    assert.deepEqual(resolved.blockers, ['codex_sdk_official_runtime_version_mismatch']);
  });
});

test('official runtime rejects metadata that does not describe the pinned binary', linuxOnly || {}, async () => {
  await withFixture('nested', async ({ packageRoot, nativePackageRoot }) => {
    const metadataPath = path.join(nativePackageRoot, 'vendor', 'x86_64-unknown-linux-musl', 'codex-package.json');
    await fsp.writeFile(metadataPath, JSON.stringify({
      version: '1.2.3',
      target: 'x86_64-unknown-linux-musl',
      variant: 'not-codex',
      entrypoint: 'bin/codex'
    }));

    const resolved = await resolveOfficialCodexPackageRuntimeAtPackageRoot(packageRoot, 'metadata-mismatch-test');
    assert.equal(resolved.ok, false);
    assert.deepEqual(resolved.blockers, ['codex_sdk_official_runtime_metadata_mismatch']);
  });
});

type Fixture = {
  tempRoot: string;
  packageRoot: string;
  nodeModulesRoot: string;
  nativePackageRoot: string;
};

async function withFixture(
  layout: 'nested' | 'hoisted' | 'outside-node-modules',
  callback: (fixture: Fixture) => Promise<void>
): Promise<void> {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-runtime-layout-'));
  const packageRoot = layout === 'nested'
    ? path.join(tempRoot, 'application')
    : layout === 'hoisted'
      ? path.join(tempRoot, 'node_modules', 'sneakoscope')
      : path.join(tempRoot, 'application');
  const nodeModulesRoot = layout === 'nested'
    ? path.join(packageRoot, 'node_modules')
    : path.join(tempRoot, 'node_modules');
  const nativePackageRoot = path.join(nodeModulesRoot, '@openai', 'codex-linux-x64');
  try {
    await writeOfficialFixture(nodeModulesRoot);
    if (layout !== 'hoisted') {
      await fsp.mkdir(path.join(packageRoot, 'node_modules'), { recursive: true });
    }
    await callback({ tempRoot, packageRoot, nodeModulesRoot, nativePackageRoot });
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

async function writeOfficialFixture(nodeModulesRoot: string): Promise<void> {
  const version = '1.2.3';
  const targetTriple = 'x86_64-unknown-linux-musl';
  const baseRoot = path.join(nodeModulesRoot, '@openai', 'codex');
  const sdkRoot = path.join(nodeModulesRoot, '@openai', 'codex-sdk');
  const nativeRoot = path.join(nodeModulesRoot, '@openai', 'codex-linux-x64');
  const vendorRoot = path.join(nativeRoot, 'vendor', targetTriple);
  await fsp.mkdir(baseRoot, { recursive: true });
  await fsp.mkdir(vendorRoot, { recursive: true });
  await fsp.writeFile(path.join(baseRoot, 'package.json'), JSON.stringify({
    name: '@openai/codex',
    version,
    optionalDependencies: { '@openai/codex-linux-x64': `npm:@openai/codex@${version}-linux-x64` }
  }));
  await fsp.mkdir(sdkRoot, { recursive: true });
  await fsp.writeFile(path.join(sdkRoot, 'package.json'), JSON.stringify({
    name: '@openai/codex-sdk',
    version,
    dependencies: { '@openai/codex': version }
  }));
  await fsp.writeFile(path.join(nativeRoot, 'package.json'), JSON.stringify({
    name: '@openai/codex',
    version: `${version}-linux-x64`
  }));
  await fsp.writeFile(path.join(vendorRoot, 'codex-package.json'), JSON.stringify({
    version,
    target: targetTriple,
    variant: 'codex',
    entrypoint: 'bin/codex'
  }));
  await fsp.mkdir(path.join(vendorRoot, 'bin'), { recursive: true });
  await fsp.writeFile(path.join(vendorRoot, 'bin', 'codex'), `#!/bin/sh\nprintf 'codex-cli ${version}\\n'\n`, { mode: 0o755 });
}
