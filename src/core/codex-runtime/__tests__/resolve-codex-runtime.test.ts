import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CodexRuntimeResolution } from '../resolve-codex-runtime.js';

const fixtureOptions = { skip: process.platform !== 'linux' || process.arch !== 'x64' };
const VERSION = '1.2.3';
const TARGET = 'x86_64-unknown-linux-musl';
const NATIVE_PACKAGE = 'codex-linux-x64';
type Layout = 'nested' | 'hoisted' | 'scoped-hoisted' | 'outside-node-modules' | 'deep-under-node-modules';

for (const layout of ['nested', 'hoisted', 'scoped-hoisted'] as const) {
  test(`official runtime resolves the actual installed package in a ${layout} layout`, fixtureOptions, async () => {
    await withFixture(layout, async ({ resolve, nativePackageRoot }) => {
      const resolved = await resolve({ requestedBy: `${layout}-layout-test` });
      assert.equal(resolved.ok, true);
      assert.deepEqual(resolved.blockers, []);
      assert.equal(resolved.identity?.requestedBy, `${layout}-layout-test`);
      assert.equal(resolved.identity?.packageRoot, await fsp.realpath(nativePackageRoot));
      assert.equal(resolved.identity?.version, VERSION);
      assert.equal(resolved.identity?.trusted, true);
      assert.equal(resolved.identity?.trust_basis, 'official_package_pin');
    });
  });
}

for (const layout of ['outside-node-modules', 'deep-under-node-modules'] as const) {
  test(`official runtime does not enable hoisting for a ${layout} package root`, fixtureOptions, async () => {
    await withFixture(layout, async ({ resolve }) => {
      assertBlocked(await resolve(), 'codex_sdk_official_runtime_package_not_found');
    });
  });
}

for (const layout of ['nested', 'hoisted'] as const) {
  for (const packageName of ['codex', 'codex-sdk', NATIVE_PACKAGE]) {
    test(`official runtime rejects a ${packageName} package symlink escape in a ${layout} layout`, fixtureOptions, async () => {
      await withFixture(layout, async ({ resolve, nodeModulesRoot, tempRoot }) => {
        const packageDir = path.join(nodeModulesRoot, '@openai', packageName);
        const escapedDir = path.join(tempRoot, 'escaped-package');
        await fsp.rename(packageDir, escapedDir);
        await fsp.symlink(escapedDir, packageDir, 'dir');
        assertBlocked(await resolve(), 'codex_sdk_official_runtime_package_path_mismatch');
      });
    });
  }

  test(`official runtime rejects a binary symlink outside its native package in a ${layout} layout`, fixtureOptions, async () => {
    await withFixture(layout, async ({ resolve, nodeModulesRoot, binaryPath }) => {
      // The binary remains inside node_modules, but must also stay inside its
      // own native package: checking only the outer boundary is insufficient.
      const escapedBinary = path.join(nodeModulesRoot, 'escaped-codex');
      await fsp.rename(binaryPath, escapedBinary);
      await fsp.symlink(escapedBinary, binaryPath);
      assertBlocked(await resolve(), 'codex_sdk_official_runtime_binary_path_mismatch');
    });
  });

  test(`official runtime rejects an SDK semver range instead of an exact pin in a ${layout} layout`, fixtureOptions, async () => {
    await withFixture(layout, async ({ resolve, nodeModulesRoot }) => {
      await writeJson(path.join(nodeModulesRoot, '@openai', 'codex-sdk', 'package.json'), {
        name: '@openai/codex-sdk', version: VERSION, dependencies: { '@openai/codex': `^${VERSION}` }
      });
      assertBlocked(await resolve(), 'codex_sdk_official_runtime_version_mismatch');
    });
  });

  test(`official runtime rejects an optional alias mismatch in a ${layout} layout`, fixtureOptions, async () => {
    await withFixture(layout, async ({ resolve, nodeModulesRoot }) => {
      await writeJson(path.join(nodeModulesRoot, '@openai', 'codex', 'package.json'), {
        name: '@openai/codex', version: VERSION,
        optionalDependencies: { [`@openai/${NATIVE_PACKAGE}`]: `npm:@openai/codex@9.9.9-linux-x64` }
      });
      assertBlocked(await resolve(), 'codex_sdk_official_runtime_platform_package_mismatch');
    });
  });

  test(`official runtime rejects a native package version mismatch in a ${layout} layout`, fixtureOptions, async () => {
    await withFixture(layout, async ({ resolve, nativePackageRoot }) => {
      await writeJson(path.join(nativePackageRoot, 'package.json'), { name: '@openai/codex', version: '9.9.9-linux-x64' });
      assertBlocked(await resolve(), 'codex_sdk_official_runtime_platform_package_mismatch');
    });
  });

  for (const mismatch of [
    { version: '9.9.9' },
    { target: 'wrong-target' },
    { variant: 'not-codex' },
    { entrypoint: '../../escaped-codex' }
  ]) {
    test(`official runtime rejects metadata ${Object.keys(mismatch)[0]} mismatch in a ${layout} layout`, fixtureOptions, async () => {
      await withFixture(layout, async ({ resolve, nativePackageRoot }) => {
        await writeJson(path.join(nativePackageRoot, 'vendor', TARGET, 'codex-package.json'), {
          version: VERSION, target: TARGET, variant: 'codex', entrypoint: 'bin/codex', ...mismatch
        });
        assertBlocked(await resolve(), 'codex_sdk_official_runtime_metadata_mismatch');
      });
    });
  }

  test(`official runtime rejects a binary version mismatch in a ${layout} layout`, fixtureOptions, async () => {
    await withFixture(layout, async ({ resolve, binaryPath }) => {
      await fsp.writeFile(binaryPath, '#!/bin/sh\necho codex-cli 9.9.9\n', { mode: 0o755 });
      assertBlocked(await resolve(), 'codex_sdk_official_runtime_package_identity_mismatch');
    });
  });
}

test('official runtime never combines SDK and runtime packages across candidate roots', fixtureOptions, async () => {
  await withFixture('hoisted', async ({ resolve, packageRoot, nodeModulesRoot }) => {
    const nestedOpenaiRoot = path.join(packageRoot, 'node_modules', '@openai');
    await fsp.mkdir(nestedOpenaiRoot, { recursive: true });
    await fsp.rename(path.join(nodeModulesRoot, '@openai', 'codex-sdk'), path.join(nestedOpenaiRoot, 'codex-sdk'));
    assertBlocked(await resolve(), 'codex_sdk_official_runtime_sdk_package_identity_mismatch');
  });
});

function assertBlocked(resolved: CodexRuntimeResolution, blocker: string): void {
  assert.equal(resolved.ok, false);
  assert.equal(resolved.identity, null);
  assert.deepEqual(resolved.blockers, [blocker]);
}

type Fixture = {
  tempRoot: string;
  packageRoot: string;
  nodeModulesRoot: string;
  nativePackageRoot: string;
  binaryPath: string;
  resolve: (input?: { requestedBy?: string }) => Promise<CodexRuntimeResolution>;
};

async function withFixture(layout: Layout, callback: (fixture: Fixture) => Promise<void>): Promise<void> {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-official-runtime-layout-'));
  const packageRoot = layout === 'hoisted'
    ? path.join(tempRoot, 'node_modules', 'sneakoscope')
    : layout === 'scoped-hoisted'
      ? path.join(tempRoot, 'node_modules', '@fixture', 'sneakoscope')
      : layout === 'deep-under-node-modules'
        ? path.join(tempRoot, 'node_modules', 'another-package', 'source-checkout')
        : path.join(tempRoot, 'application');
  const nodeModulesRoot = layout === 'nested' ? path.join(packageRoot, 'node_modules') : path.join(tempRoot, 'node_modules');
  const nativePackageRoot = path.join(nodeModulesRoot, '@openai', NATIVE_PACKAGE);
  const binaryPath = path.join(nativePackageRoot, 'vendor', TARGET, 'bin', 'codex');
  try {
    await writeOfficialFixture(nodeModulesRoot);
    // Copy only the compiled resolver's five-module closure. Importing from
    // this real package location exercises packageRoot() itself, with no mock,
    // environment override, or exported path-taking resolver entry point.
    const coreRoot = new URL('../../', import.meta.url);
    for (const relativeFile of [
      'fsx.js', 'version.js', 'codex-runtime/resolve-codex-runtime.js',
      'codex-compat/codex-version-policy.js', 'codex-compat/codex-runtime-contract.js'
    ]) {
      const destination = path.join(packageRoot, 'dist', 'core', relativeFile);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(new URL(relativeFile, coreRoot), destination);
    }
    await writeJson(path.join(packageRoot, 'package.json'), {
      name: 'sneakoscope', version: VERSION, type: 'module', dependencies: { '@openai/codex-sdk': VERSION }
    });
    const resolverUrl = pathToFileURL(path.join(packageRoot, 'dist', 'core', 'codex-runtime', 'resolve-codex-runtime.js'));
    const resolver = await import(resolverUrl.href) as typeof import('../resolve-codex-runtime.js');
    await callback({ tempRoot, packageRoot, nodeModulesRoot, nativePackageRoot, binaryPath, resolve: resolver.resolveOfficialCodexPackageRuntime });
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(data)}\n`);
}

async function writeOfficialFixture(nodeModulesRoot: string): Promise<void> {
  const nativeRoot = path.join(nodeModulesRoot, '@openai', NATIVE_PACKAGE);
  const vendorRoot = path.join(nativeRoot, 'vendor', TARGET);
  await writeJson(path.join(nodeModulesRoot, '@openai', 'codex', 'package.json'), {
    name: '@openai/codex', version: VERSION,
    optionalDependencies: { [`@openai/${NATIVE_PACKAGE}`]: `npm:@openai/codex@${VERSION}-linux-x64` }
  });
  await writeJson(path.join(nodeModulesRoot, '@openai', 'codex-sdk', 'package.json'), {
    name: '@openai/codex-sdk', version: VERSION, dependencies: { '@openai/codex': VERSION }
  });
  await writeJson(path.join(nativeRoot, 'package.json'), { name: '@openai/codex', version: `${VERSION}-linux-x64` });
  await writeJson(path.join(vendorRoot, 'codex-package.json'), {
    version: VERSION, target: TARGET, variant: 'codex', entrypoint: 'bin/codex'
  });
  await fsp.mkdir(path.join(vendorRoot, 'bin'), { recursive: true });
  await fsp.writeFile(path.join(vendorRoot, 'bin', 'codex'), `#!/bin/sh\necho codex-cli ${VERSION}\n`, { mode: 0o755 });
}
