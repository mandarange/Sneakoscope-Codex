#!/usr/bin/env node
import { runProcess } from '../src/core/fsx.mjs';

const manifest = 'crates/sks-core/Cargo.toml';
const commands = [
  { cmd: 'cargo', args: ['run', '--manifest-path', manifest, '--quiet', '--', '--version'], expectCode: 0 },
  { cmd: 'cargo', args: ['run', '--manifest-path', manifest, '--quiet', '--', 'image-hash', 'test/fixtures/images/one-by-one.png'], expectCode: 0 },
  { cmd: 'cargo', args: ['run', '--manifest-path', manifest, '--quiet', '--', 'voxel-validate', 'test/fixtures/wiki-image/valid-ledger.json', '--require-anchors'], expectCode: 0 },
  { cmd: 'cargo', args: ['run', '--manifest-path', manifest, '--quiet', '--', 'voxel-validate', 'test/fixtures/wiki-image/invalid-bbox-ledger.json', '--require-anchors'], expectCode: 1, expectStdout: 'bbox_width_out_of_bounds:bad-bbox' },
  { cmd: 'cargo', args: ['run', '--manifest-path', manifest, '--quiet', '--', 'voxel-validate', 'test/fixtures/wiki-image/missing-image-ref-ledger.json', '--require-anchors', '--require-relations'], expectCode: 1, expectStdout: 'anchor_image_ref:missing-ref' },
  { cmd: 'cargo', args: ['run', '--manifest-path', manifest, '--quiet', '--', 'secret-scan', 'test/fixtures/secrets/clean.txt'], expectCode: 0 }
];
const results = [];
for (const { cmd, args, expectCode, expectStdout } of commands) {
  const result = await runProcess(cmd, args, { timeoutMs: 120000, maxOutputBytes: 256 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  results.push({
    cmd: `${cmd} ${args.join(' ')}`,
    ok: result.code === expectCode && (!expectStdout || result.stdout.includes(expectStdout)),
    expected_code: expectCode,
    code: result.code,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  });
}
const ok = results.every((row) => row.ok);
console.log(JSON.stringify({ schema: 'sks.rust-smoke.v1', ok, results }, null, 2));
if (!ok) process.exitCode = 1;
