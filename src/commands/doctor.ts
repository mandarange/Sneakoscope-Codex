import { projectRoot, dirSize, exists, formatBytes } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { getCodexInfo } from '../core/codex-adapter.js';
import { rustInfo } from '../core/rust-accelerator.js';
import { codexAppIntegrationStatus } from '../core/codex-app.js';
import { codexLbMetrics, readCodexLbCircuit } from '../core/codex-lb-circuit.js';
import { ensureGlobalCodexSkillsDuringInstall } from '../cli/install-helpers.js';
import { normalizeInstallScope } from '../core/init.js';
import { inspectCodexConfigReadability } from '../core/codex/codex-config-readability.js';
import { repairCodexConfigEperm } from '../core/codex/codex-config-eperm-repair.js';
import { writeDoctorReadinessMatrix } from '../core/doctor/doctor-readiness-matrix.js';
import { runCodexDoctorBridge, compareCodexDoctorBridge } from '../core/doctor/codex-doctor-bridge.js';
import { checkZellijCapability } from '../core/zellij/zellij-capability.js';
import { inventoryCodexPermissionProfiles } from '../core/codex/codex-permission-profiles.js';

export async function run(_command: any, args: any = []) {
  let setupRepair = null;
  if (flag(args, '--fix')) {
    const { setupCommand } = await import('../core/commands/basic-cli.js');
    const installScope = installScopeFromArgs(args);
    const setupArgs = ['--force', '--install-scope', installScope];
    if (flag(args, '--local-only')) setupArgs.push('--local-only');
    await setupCommand(setupArgs);
    setupRepair = {
      install_scope: installScope,
      global_skills: installScope === 'global' && !flag(args, '--local-only')
        ? await ensureGlobalCodexSkillsDuringInstall({ force: true })
        : { status: 'skipped', reason: 'project or local-only repair' }
    };
  }
  const root = await projectRoot();
  const codexBin = readOption(args, '--codex-bin', process.env.SKS_DOCTOR_CODEX_BIN || '');
  const configProbeOpts = {
    codexProbe: flag(args, '--fix') || flag(args, '--actual-codex') || Boolean(codexBin),
    actualCodex: flag(args, '--fix') || flag(args, '--actual-codex') || Boolean(codexBin),
    requireActualCodex: flag(args, '--fix') || flag(args, '--require-actual-codex'),
    codexBin: codexBin || undefined
  };
  const codexDoctorBefore = flag(args, '--fix') ? await runCodexDoctorBridge({ codexBin: codexBin || null, cwd: root, required: flag(args, '--require-actual-codex') }).catch(() => null) : null;
  const configRepair = flag(args, '--fix') ? await repairCodexConfigEperm(root, { fix: true, ...configProbeOpts }) : null;
  const codexConfig = configRepair?.after || await inspectCodexConfigReadability(root, configProbeOpts);
  const codexDoctor = await runCodexDoctorBridge({ codexBin: codexBin || null, cwd: root, required: flag(args, '--require-actual-codex') });
  const codexDoctorDiff = compareCodexDoctorBridge(codexDoctorBefore, codexDoctor);
  const codex = codexBin
    ? { bin: codexBin, version: 'fixture-or-explicit', available: true }
    : await getCodexInfo().catch(() => ({ bin: null, version: null, available: false }));
  const rust: any = await rustInfo().catch((err: any) => ({
    available: false,
    mode: 'js_fallback',
    status: 'error',
    version: null,
    error: err.message
  }));
  const codexApp = await codexAppIntegrationStatus({ codex }).catch((err: any) => ({ ok: false, error: err.message }));
  const codexLb = codexLbMetrics(await readCodexLbCircuit(root).catch(() => ({})));
  const zellij = await checkZellijCapability({ root, require: process.env.SKS_REQUIRE_ZELLIJ === '1' });
  const permissionProfiles = await inventoryCodexPermissionProfiles(root, { writeReport: true });
  const pkgBytes = await dirSize(root).catch(() => 0);
  const ready = await writeDoctorReadinessMatrix(root, {
    codex,
    codex_config: codexConfig,
    codex_app: codexApp,
    codex_lb: codexLb,
    codex_doctor: codexDoctor,
    require_codex_doctor: flag(args, '--require-actual-codex'),
    zellij,
    repair: configRepair,
    require_codex_cli_config_load: flag(args, '--fix') || flag(args, '--require-actual-codex'),
    operator_actions: [
      ...(codexConfig.operator_actions || []),
      ...(configRepair?.operator_actions || [])
    ]
  });
  const result = {
    schema: 'sks.doctor-status.v1',
    ok: ready.ready,
    root,
    node: { ok: Number(process.versions.node.split('.')[0]) >= 20, version: process.version },
    codex,
    codex_config: codexConfig,
    rust,
    codex_app: codexApp,
    codex_lb: codexLb,
    codex_doctor: codexDoctor,
    codex_doctor_diff: codexDoctorDiff,
    zellij,
    codex_permission_profiles: permissionProfiles,
    ready,
    sneakoscope: { ok: await exists(`${root}/.sneakoscope`) },
    package: { bytes: pkgBytes, human: formatBytes(pkgBytes) },
    repair: { setup: setupRepair, codex_config: configRepair }
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
  const actual = (codexConfig.checks || []).find((check: any) => check.name === 'actual_codex_cli_config_load');
  console.log('Project config:');
  console.log(`  node read:       ${ready.codex_config_readable_by_node ? 'ok' : 'failed'}`);
  console.log(`  codex cli read:  ${ready.codex_config_readable_by_codex_cli ? 'ok' : (actual?.status || 'failed')}`);
  console.log(`  Zellij:          ${zellij.status}`);
  console.log(`  removed runtime: tmux`);
  console.log(`  codex doctor:    ${codexDoctor.available ? (codexDoctor.exit_code === 0 ? 'ok' : 'warning') : 'unavailable'}`);
  console.log(`Rust acc.: ${rust.mode || (rust.available ? 'rust_accelerated' : 'js_fallback')} ${rust.version || rust.status || ''}`);
  console.log(`Codex App: ${ready.codex_app_ready ? 'ok' : 'optional_missing'}`);
  console.log(`codex-lb:  ${codexLb.ok ? 'ok' : `warning ${codexLb.circuit?.state || 'unknown'}`}`);
  console.log(`Permissions: config profile and permission profile are tracked separately (${permissionProfiles.codex_config_profile_field}, ${permissionProfiles.codex_permission_profile_field})`);
  console.log('Ready:');
  console.log(`  cli_ready: ${ready.cli_ready ? 'yes' : 'no'}`);
  console.log(`  mad_ready: ${ready.mad_ready ? 'yes' : 'no'}`);
  console.log(`  ready:     ${ready.ready ? 'yes' : 'no'}`);
  if (!ready.ready) {
    console.log('Primary blocker:');
    console.log(`  ${ready.primary_blocker || 'unknown'}`);
  }
  if (configRepair?.repair_actions?.length) {
    console.log('What I fixed:');
    for (const action of configRepair.repair_actions) console.log(`  - ${action.name}: ${action.ok ? 'ok' : 'failed'}`);
  }
  if (!ready.ready && ready.next_actions?.length) {
    console.log('What still needs you:');
    for (const action of ready.next_actions) console.log(`  - ${action}`);
  }
  if (!result.ok) process.exitCode = 1;
}

function installScopeFromArgs(args: any = []) {
  if (flag(args, '--project')) return 'project';
  if (flag(args, '--global')) return 'global';
  const index = args.indexOf('--install-scope');
  return normalizeInstallScope(index >= 0 && args[index + 1] ? args[index + 1] : 'global');
}

function readOption(args: any = [], name: string, fallback: any = null) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
