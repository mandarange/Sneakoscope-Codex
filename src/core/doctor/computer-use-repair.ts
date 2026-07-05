import path from 'node:path';
import { CODEX_APP_DOCS_URL } from '../codex-app.js';
import { computerUseStatusReport } from '../computer-use-status.js';
import { ensureDir, nowIso, runProcess, which, writeJsonAtomic } from '../fsx.js';

export const DOCTOR_COMPUTER_USE_REPAIR_SCHEMA = 'sks.doctor-computer-use-repair.v1';

export interface DoctorComputerUseRepairStep {
  id: string;
  ok: boolean;
  attempted: boolean;
  command?: string | null;
  status?: string | null;
  exit_code?: number | null;
  blocker?: string | null;
  stdout_tail?: string | null;
  stderr_tail?: string | null;
}

export async function repairComputerUse(input: {
  root: string;
  apply?: boolean;
  codexBin?: string | null;
  reportPath?: string | null;
  timeoutMs?: number;
  probe?: (opts: any) => Promise<any>;
}): Promise<any> {
  const root = path.resolve(input.root || process.cwd());
  const apply = input.apply === true;
  const probe = input.probe || computerUseStatusReport;
  const steps: DoctorComputerUseRepairStep[] = [];
  const before = await probe({ root, codexBin: input.codexBin || undefined, forceMacos: true })
    .catch((err: unknown) => ({ ok: false, status: 'unknown', blockers: [messageOf(err)] }));

  let codexBin = input.codexBin || await which('codex').catch(() => null);
  let versionStep: DoctorComputerUseRepairStep;
  if (codexBin) {
    const version = await runProcess(codexBin, ['--version'], { timeoutMs: input.timeoutMs || 5000, maxOutputBytes: 16 * 1024 })
      .catch((err: unknown) => ({ code: 1, stdout: '', stderr: messageOf(err) }));
    versionStep = {
      id: 'codex_cli_version',
      ok: version.code === 0,
      attempted: true,
      command: `${codexBin} --version`,
      exit_code: version.code,
      stdout_tail: tail(version.stdout),
      stderr_tail: tail(version.stderr),
      blocker: version.code === 0 ? null : 'codex_cli_version_failed'
    };
  } else {
    versionStep = {
      id: 'codex_cli_version',
      ok: false,
      attempted: false,
      command: 'codex --version',
      blocker: 'codex_binary_missing'
    };
  }
  steps.push(versionStep);

  const beforeReady = before?.status === 'available';
  const needsFeatureFlag = before?.status === 'codex_app_capability_missing' || before?.status === 'unknown';

  if (codexBin && !beforeReady && needsFeatureFlag && apply) {
    const enable = await runProcess(codexBin, ['features', 'enable', 'computer_use'], {
      timeoutMs: input.timeoutMs || 10000,
      maxOutputBytes: 32 * 1024
    }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: messageOf(err) }));
    steps.push({
      id: 'computer_use_feature_enable',
      ok: enable.code === 0,
      attempted: true,
      command: `${codexBin} features enable computer_use`,
      exit_code: enable.code,
      stdout_tail: tail(enable.stdout),
      stderr_tail: tail(enable.stderr),
      blocker: enable.code === 0 ? null : 'codex_feature_enable_unsupported_or_failed'
    });
  } else {
    steps.push({
      id: 'computer_use_feature_enable',
      ok: beforeReady,
      attempted: false,
      command: codexBin ? `${codexBin} features enable computer_use` : 'codex features enable computer_use',
      blocker: beforeReady
        ? null
        : !apply
          ? 'doctor_fix_not_requested'
          : !codexBin
            ? 'codex_cli_missing'
            : 'computer_use_capability_missing_not_feature_flag_shaped'
    });
  }

  // codex plugin install subcommand syntax is not documented anywhere in this repo or the
  // Codex CLI docs snapshot; a real `codex plugin --help` lookup was attempted but the
  // binary was unavailable/unverified in this environment, so no install command is guessed.
  const pluginInstallStep: DoctorComputerUseRepairStep = {
    id: 'computer_use_plugin_install_lookup',
    ok: false,
    attempted: false,
    command: codexBin ? `${codexBin} plugin --help` : 'codex plugin --help',
    blocker: 'codex_plugin_install_subcommand_unverified'
  };
  let pluginHelpRaw: string | null = null;
  if (codexBin && before?.status === 'codex_app_missing' && apply) {
    const help = await runProcess(codexBin, ['plugin', '--help'], {
      timeoutMs: input.timeoutMs || 8000,
      maxOutputBytes: 32 * 1024
    }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: messageOf(err) }));
    pluginHelpRaw = tail(help.stdout || help.stderr, 4000);
    pluginInstallStep.attempted = true;
    pluginInstallStep.exit_code = help.code;
    pluginInstallStep.stdout_tail = tail(help.stdout);
    pluginInstallStep.stderr_tail = tail(help.stderr);
    const installSubcommand = extractPluginInstallSubcommand(help.stdout || help.stderr || '');
    if (installSubcommand) {
      pluginInstallStep.ok = false;
      pluginInstallStep.blocker = 'codex_plugin_install_subcommand_found_but_not_auto_run';
    } else {
      pluginInstallStep.blocker = 'codex_plugin_help_did_not_reveal_install_subcommand';
    }
  }
  steps.push(pluginInstallStep);

  const after = await probe({ root, codexBin: codexBin || undefined, forceMacos: true })
    .catch((err: unknown) => ({ ok: false, status: 'unknown', blockers: [messageOf(err)] }));
  steps.push({
    id: 'computer_use_status_redetect',
    ok: after?.status === 'available',
    attempted: true,
    command: 'codex features list --json',
    blocker: after?.status === 'available' ? null : String(after?.status || 'unknown')
  });

  const recovered = after?.status === 'available';
  const blockers = recovered ? [] : [
    ...new Set([
      String(after?.status || 'computer_use_unavailable'),
      ...(pluginInstallStep.attempted && !recovered ? [pluginInstallStep.blocker as string] : [])
    ].filter(Boolean).map(String))
  ];
  const nextActions = recovered ? [] : [
    'Install/update Codex CLI if missing: npm i -g @openai/codex@latest',
    'Open Codex App settings and enable Computer Use, or run: codex features enable computer_use',
    after?.status === 'codex_app_missing'
      ? 'A live `codex plugin --help` (or equivalent) lookup is required to find the real plugin install subcommand before SKS can auto-install a Computer Use plugin; this was not guessed. A human should run `codex plugin --help` (or check Codex App settings) and report the exact install subcommand back so it can be wired into this repair function.'
      : 'Verify with: codex features list --json',
    `Docs: ${CODEX_APP_DOCS_URL}`
  ];
  let report: any = {
    schema: DOCTOR_COMPUTER_USE_REPAIR_SCHEMA,
    generated_at: nowIso(),
    ok: recovered,
    attempted: !beforeReady,
    apply,
    recovered,
    before,
    after,
    steps,
    blockers,
    next_actions: nextActions,
    plugin_help_raw: pluginHelpRaw,
    docs_url: CODEX_APP_DOCS_URL
  };
  if (input.reportPath !== null) {
    const reportPath = input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-computer-use-repair.json');
    try {
      await ensureDir(path.dirname(reportPath));
      await writeJsonAtomic(reportPath, report);
      report = { ...report, report_path: reportPath };
    } catch (err: unknown) {
      report = { ...report, report_write_failed: true, report_write_error: messageOf(err) };
    }
  }
  return report;
}

function extractPluginInstallSubcommand(helpText: string): string | null {
  const match = String(helpText || '').match(/^\s*install\s+/m);
  return match ? 'install' : null;
}

function tail(value: unknown, max = 2000) {
  const text = String(value || '');
  return text.length > max ? text.slice(-max) : text;
}

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
