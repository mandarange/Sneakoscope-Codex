import { projectRoot, dirSize, exists, formatBytes } from '../core/fsx.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { getCodexInfo } from '../core/codex-adapter.mjs';
import { rustInfo } from '../core/rust-accelerator.mjs';
import { codexAppIntegrationStatus } from '../core/codex-app.mjs';
import { codexLbMetrics, readCodexLbCircuit } from '../core/codex-lb-circuit.mjs';
import { ensureGlobalCodexSkillsDuringInstall } from '../cli/install-helpers.mjs';
import { normalizeInstallScope } from '../core/init.mjs';

export async function run(_command, args = []) {
  let repair = null;
  if (flag(args, '--fix')) {
    const { setupCommand } = await import('../core/commands/basic-cli.mjs');
    const installScope = installScopeFromArgs(args);
    const setupArgs = ['--force', '--install-scope', installScope];
    if (flag(args, '--local-only')) setupArgs.push('--local-only');
    await setupCommand(setupArgs);
    repair = {
      install_scope: installScope,
      global_skills: installScope === 'global' && !flag(args, '--local-only')
        ? await ensureGlobalCodexSkillsDuringInstall({ force: true })
        : { status: 'skipped', reason: 'project or local-only repair' }
    };
  }
  const root = await projectRoot();
  const codex = await getCodexInfo().catch((err) => ({ available: false, error: err.message }));
  const rust = await rustInfo().catch((err) => ({ available: false, error: err.message }));
  const codexApp = await codexAppIntegrationStatus({ codex }).catch((err) => ({ ok: false, error: err.message }));
  const codexLb = codexLbMetrics(await readCodexLbCircuit(root).catch(() => ({})));
  const pkgBytes = await dirSize(root).catch(() => 0);
  const result = {
    schema: 'sks.doctor-status.v1',
    ok: Boolean(codex.bin) && codexApp.ok && codexLb.ok,
    root,
    node: { ok: Number(process.versions.node.split('.')[0]) >= 20, version: process.version },
    codex,
    rust,
    codex_app: codexApp,
    codex_lb: codexLb,
    sneakoscope: { ok: await exists(`${root}/.sneakoscope`) },
    package: { bytes: pkgBytes, human: formatBytes(pkgBytes) },
    repair
  };
  if (flag(args, '--json')) {
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log('SKS Doctor');
  console.log(`Root:      ${root}`);
  console.log(`Node:      ${result.node.ok ? 'ok' : 'fail'} ${result.node.version}`);
  console.log(`Codex:     ${codex.bin ? 'ok' : 'missing'} ${codex.version || ''}`);
  console.log(`Rust acc.: ${rust.available ? rust.version : 'optional-missing'}`);
  console.log(`Codex App: ${codexApp.ok ? 'ok' : 'needs setup'}`);
  console.log(`codex-lb:  ${codexLb.ok ? 'ok' : `blocked ${codexLb.circuit?.state || 'unknown'}`}`);
  console.log(`Ready:     ${result.ok ? 'yes' : 'no'}`);
  if (!result.ok) process.exitCode = 1;
}

function installScopeFromArgs(args = []) {
  if (flag(args, '--project')) return 'project';
  if (flag(args, '--global')) return 'global';
  const index = args.indexOf('--install-scope');
  return normalizeInstallScope(index >= 0 && args[index + 1] ? args[index + 1] : 'global');
}
