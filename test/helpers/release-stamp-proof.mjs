import fs from 'node:fs';
import path from 'node:path';

export function createReleaseStampProof(root = process.cwd()) {
  const runId = `test-full-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dir = path.join(root, '.sneakoscope', 'reports', 'release-gates', runId);
  const summaryPath = path.join(dir, 'summary.json');
  const realSummaryPath = path.join(dir, 'release-real-check.json');
  const stampPath = path.join(dir, 'release-check-stamp.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify({
    schema: 'sks.release-gate-dag-run.v1',
    ok: true,
    run_id: runId,
    selected_preset: 'release',
    selected_gates: 2,
    selected_gate_ids: ['test:gate-a', 'test:gate-b'],
    completed: 2,
    failed: 0,
    affected_selection: { mode: 'full' },
    completion_certificate: {
      confidence: 'full-release-proof',
      full_release_proof: 'current_run'
    }
  }, null, 2)}\n`);
  fs.writeFileSync(realSummaryPath, `${JSON.stringify({
    schema: 'sks.release-real-check.v1',
    generated_at: new Date().toISOString(),
    ok: true,
    all_checks: [{ id: 'test:real-capability', ok: true }],
    blockers: [],
    warnings: []
  }, null, 2)}\n`);
  const relative = path.relative(root, summaryPath);
  const realRelative = path.relative(root, realSummaryPath);
  return {
    summaryPath,
    realSummaryPath,
    stampPath,
    env: { SKS_RELEASE_STAMP_PATH: stampPath },
    writeArgs: ['write', '--preset', 'release', '--full', '--summary', relative, '--real-summary', realRelative],
    writeCommand: `${JSON.stringify(process.execPath)} ./dist/scripts/release-check-stamp.js write --preset release --full --summary ${JSON.stringify(relative)} --real-summary ${JSON.stringify(realRelative)}`,
    cleanup() { fs.rmSync(dir, { recursive: true, force: true }); }
  };
}
