import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeRuntimeScriptPackClosure,
  declaredRuntimeScriptAllowlist,
  formatRuntimeScriptAllowlist
} from '../runtime-script-pack-closure.js';

test('runtime script closure follows manifest, package, static, dynamic, helper, and transitive references', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-runtime-closure-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  await write(root, 'package.json', JSON.stringify({
    scripts: { check: 'node ./dist/scripts/package-root.js' },
    files: [
      'dist',
      '!dist/scripts/**',
      'dist/scripts/{child.js,dynamic.js,joined.js,lib/helper.js,manual.js,manifest-root.js,non-script-root.js,package-root.js,static.js}'
    ]
  }));
  await write(root, 'release-gates.v2.json', JSON.stringify({
    schema: 'sks.release-gates.v2', gates: [{ command: 'node ./dist/scripts/manifest-root.js' }]
  }));
  await write(root, 'infra-harness-gates.json', JSON.stringify({ schema: 'sks.infra-harness-gates.v1', gates: [] }));
  await write(root, 'runtime-required-scripts.json', JSON.stringify({
    schema: 'sks.runtime-required-scripts.v1',
    scripts: [{ path: 'dist/scripts/manual.js', reason: 'fixture' }],
    dynamic_reference_policies: [{ source: 'dist/scripts/package-root.js', reason: 'fixture computed path is manually rooted' }]
  }));
  await write(root, 'dist/core/launcher.js', "export const script = 'dist/scripts/non-script-root.js';\n");
  await write(root, 'dist/scripts/package-root.js', [
    "import './static.js';",
    "await import('./dynamic.js');",
    "nodeScript('child.js');",
    "path.join('dist', 'scripts', 'joined.js');",
    'const computed = `./dist/scripts/${name}`;',
    "import './lib/helper.js';",
    ''
  ].join('\n'));
  for (const file of ['static.js', 'dynamic.js', 'child.js', 'joined.js', 'manual.js', 'manifest-root.js', 'non-script-root.js']) {
    await write(root, `dist/scripts/${file}`, 'export {};\n');
  }
  await write(root, 'dist/scripts/lib/helper.js', "import '../manual.js';\n");

  const analysis = analyzeRuntimeScriptPackClosure(root);
  assert.deepEqual(analysis.missing_references, []);
  assert.deepEqual(analysis.declaration_issues, []);
  assert.deepEqual(analysis.missing_from_allowlist, []);
  assert.deepEqual(analysis.stale_allowlist_entries, []);
  assert.equal(analysis.dynamic_reference_warnings.length, 1);
  assert.deepEqual(analysis.uncovered_dynamic_references, []);
  assert.deepEqual(analysis.stale_dynamic_reference_policies, []);
  assert.deepEqual(analysis.closure, [
    'dist/scripts/child.js',
    'dist/scripts/dynamic.js',
    'dist/scripts/joined.js',
    'dist/scripts/lib/helper.js',
    'dist/scripts/manifest-root.js',
    'dist/scripts/manual.js',
    'dist/scripts/non-script-root.js',
    'dist/scripts/package-root.js',
    'dist/scripts/static.js'
  ]);
});

test('runtime script allowlist reports missing and stale entries and renders bounded brace chunks', () => {
  const declared = declaredRuntimeScriptAllowlist([
    'dist',
    '!dist/scripts/**',
    'dist/scripts/{a.js,stale.js}'
  ]);
  assert.deepEqual(declared, { declared: ['dist/scripts/a.js', 'dist/scripts/stale.js'], issues: [] });
  assert.deepEqual(formatRuntimeScriptAllowlist(['dist/scripts/a.js', 'dist/scripts/lib/b.js'], 1), [
    '!dist/scripts/**',
    'dist/scripts/{a.js}',
    'dist/scripts/{lib/b.js}'
  ]);
  assert.ok(declared.declared.includes('dist/scripts/stale.js'));
  const invalid = declaredRuntimeScriptAllowlist(['dist', 'dist/scripts/*.js']);
  assert.ok(invalid.issues.includes('broad_script_exclusion_count:0'));
  assert.ok(invalid.issues.includes('unsupported_script_allowlist_pattern:dist/scripts/*.js'));
});

async function write(root: string, relative: string, value: string): Promise<void> {
  const file = path.join(root, relative);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, value);
}
