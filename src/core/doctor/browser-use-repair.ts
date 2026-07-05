import path from 'node:path';
import { codexChromeExtensionStatus, CODEX_CHROME_EXTENSION_SETUP_DOCS_URL } from '../codex-app.js';
import { runDoctorCodexStartupRepair } from './doctor-codex-startup-repair.js';
import { ensureDir, nowIso, runProcess, which, writeJsonAtomic } from '../fsx.js';

export const DOCTOR_BROWSER_USE_REPAIR_SCHEMA = 'sks.doctor-browser-use-repair.v1';

export interface DoctorBrowserUseRepairStep {
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

export async function repairBrowserUse(input: {
  root: string;
  apply?: boolean;
  reportPath?: string | null;
  codexBin?: string | null;
  timeoutMs?: number;
  detectChromeExtensionStatus?: (opts: any) => Promise<any>;
  nodeReplRepair?: (opts: any) => Promise<any>;
}): Promise<any> {
  const root = path.resolve(input.root || process.cwd());
  const apply = input.apply === true;
  const detect = input.detectChromeExtensionStatus || codexChromeExtensionStatus;
  const repairNodeReplEnv = input.nodeReplRepair || runDoctorCodexStartupRepair;
  const steps: DoctorBrowserUseRepairStep[] = [];

  const before = await detect({}).catch((err: unknown) => ({
    ok: false,
    status: 'setup_required',
    blockers: [messageOf(err)],
    plugin: { installed: false, enabled: false },
    required_flags: ['browser_use_external', 'plugins', 'apps'],
    guidance: []
  }));

  const codexBin = input.codexBin || await which('codex').catch(() => null);
  steps.push({
    id: 'codex_cli_present',
    ok: Boolean(codexBin),
    attempted: false,
    command: 'which codex',
    blocker: codexBin ? null : 'codex_binary_missing'
  });

  const flagsNeedingEnable = ['browser_use_external', 'plugins'];
  for (const flag of flagsNeedingEnable) {
    const alreadyOk = before?.ok === true || (before?.blockers || []).every((b: string) => !b.includes(`${flag}_feature_missing`));
    if (codexBin && apply) {
      const enable = await runProcess(codexBin, ['features', 'enable', flag], {
        timeoutMs: input.timeoutMs || 10000,
        maxOutputBytes: 32 * 1024
      }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: messageOf(err) }));
      steps.push({
        id: `${flag}_feature_enable`,
        ok: enable.code === 0,
        attempted: true,
        command: `${codexBin} features enable ${flag}`,
        exit_code: enable.code,
        stdout_tail: tail(enable.stdout),
        stderr_tail: tail(enable.stderr),
        blocker: enable.code === 0 ? null : 'codex_feature_enable_unsupported_or_failed'
      });
    } else {
      steps.push({
        id: `${flag}_feature_enable`,
        ok: alreadyOk,
        attempted: false,
        command: codexBin ? `${codexBin} features enable ${flag}` : `codex features enable ${flag}`,
        blocker: alreadyOk ? null : apply ? 'codex_cli_missing' : 'doctor_fix_not_requested'
      });
    }
  }

  // codex plugin enable/install has no documented CLI subcommand for the bundled chrome plugin
  // in this repo's evidence (only `plugin list --json` / app-server plugin RPCs are attested); do not guess one.
  steps.push({
    id: 'chrome_plugin_enable',
    ok: false,
    attempted: false,
    command: null,
    status: 'needs_more_info',
    blocker: 'chrome_plugin_enable_cli_subcommand_unknown'
  });

  let nodeReplStep: DoctorBrowserUseRepairStep;
  if (apply) {
    const nodeReplResult = await repairNodeReplEnv({ root, fix: true }).catch((err: unknown) => ({
      ok: false,
      blockers: [messageOf(err)]
    }));
    nodeReplStep = {
      id: 'node_repl_env_block_repair',
      ok: (nodeReplResult as any)?.ok !== false,
      attempted: true,
      command: 'runDoctorCodexStartupRepair({ fix: true })',
      blocker: (nodeReplResult as any)?.ok === false ? ((nodeReplResult as any)?.blockers?.[0] || 'node_repl_env_block_repair_incomplete') : null
    };
  } else {
    nodeReplStep = {
      id: 'node_repl_env_block_repair',
      ok: true,
      attempted: false,
      command: 'runDoctorCodexStartupRepair({ fix: true })',
      blocker: 'doctor_fix_not_requested'
    };
  }
  steps.push(nodeReplStep);

  const after = await detect({}).catch((err: unknown) => ({
    ok: false,
    status: 'setup_required',
    blockers: [messageOf(err)],
    plugin: { installed: false, enabled: false },
    required_flags: ['browser_use_external', 'plugins', 'apps'],
    guidance: []
  }));

  const extensionMissing = (after?.blockers || []).some((b: string) =>
    b.startsWith('chrome_extension_plugin_missing')
    || b.startsWith('chrome_extension_plugin_not_installed')
    || b.startsWith('chrome_extension_plugin_cache_only_unverified')
  );

  const blockers: string[] = [...(after?.blockers || [])];
  if (extensionMissing && !blockers.includes('chrome_extension_manual_install_required')) {
    blockers.push('chrome_extension_manual_install_required');
  }

  const recovered = after?.ok === true;
  const nextActions = recovered ? [] : [
    'Open the Codex Desktop app and check its settings for the Chrome/Browser Use plugin entry (exact menu wording may vary by version; check Codex app settings generically if unsure).',
    'If a Chrome extension install/enable action is offered from within Codex App settings, follow it there rather than the Chrome Web Store directly, since Codex App is the source of truth for what "ready" means for this feature.',
    `If no in-app action is available, consult the setup docs: ${CODEX_CHROME_EXTENSION_SETUP_DOCS_URL}`,
    'After installing/enabling the extension, tell SKS it is installed and rerun this repair to re-detect.',
    'Verify with: codex features list | rg "browser_use_external|plugins|apps"'
  ];

  let report: any = {
    schema: DOCTOR_BROWSER_USE_REPAIR_SCHEMA,
    generated_at: nowIso(),
    ok: recovered,
    attempted: before?.ok !== true,
    apply,
    recovered,
    before,
    after,
    steps,
    blockers: [...new Set(blockers)],
    next_actions: nextActions,
    manual_actions: nextActions,
    docs_url: CODEX_CHROME_EXTENSION_SETUP_DOCS_URL
  };

  if (input.reportPath !== null) {
    const reportPath = input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-browser-use-repair.json');
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

function tail(value: unknown, max = 2000) {
  const text = String(value || '');
  return text.length > max ? text.slice(-max) : text;
}

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
