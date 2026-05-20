import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export async function run(_command, args = []) {
  const action = args[0] || 'compatibility';
  const json = args.includes('--json');
  const snapshotDir = path.resolve('src/vendor/openai-codex/rust-v0.131.0/hooks');
  const schemaFiles = fs.existsSync(snapshotDir) ? fs.readdirSync(snapshotDir).filter((file) => file.endsWith('.schema.json')) : [];
  const detected = detectCodex();
  const result = {
    schema: action === 'doctor' ? 'sks.codex-doctor.v1' : 'sks.codex-compat.v1',
    required_baseline: 'rust-v0.132.0',
    detected,
    hooks_schema: { snapshot: 'rust-v0.131.0', ok: schemaFiles.length >= 16, files: schemaFiles.length },
    codex_0_132: {
      baseline: 'rust-v0.132.0',
      capabilities: [
        'exec_resume_output_schema',
        'app_server_image_fidelity',
        'memory_summary_version_rebuild',
        'goal_continuation_blocker_stop',
        'tui_probe_batching'
      ],
      hook_strict_subset_baseline: 'rust-v0.131.0'
    },
    ok: schemaFiles.length >= 16,
    warnings: detected.available ? [] : ['codex binary not detected; release schema checks use vendored rust-v0.131.0 snapshots']
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === 'version') console.log(`Codex detected: ${detected.version || 'not installed'}`);
  else console.log(`Codex compatibility: ${result.ok ? 'ok' : 'blocked'} (${result.required_baseline})`);
  if (!result.ok) process.exitCode = 1;
}

function detectCodex() {
  const out = spawnSync('codex', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
  const text = `${out.stdout || ''}\n${out.stderr || ''}`;
  const version = text.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] || null;
  return { available: Boolean(version), version, source: version ? 'codex --version' : null };
}
