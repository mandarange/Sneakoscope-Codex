import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureDir, exists, globalSksRoot, packageRoot, PACKAGE_VERSION, readText, runProcess, tmpdir, which, writeTextAtomic } from '../core/fsx.js';
import { createRequestedScopeContract } from '../core/safety/requested-scope-contract.js';
import { guardedPackageInstall, guardContextForRoute } from '../core/safety/mutation-guard.js';
import { EMPTY_CODEX_INFO, getCodexInfo } from '../core/codex-adapter.js';
import { formatHarnessConflictReport, llmHarnessCleanupPrompt, scanHarnessConflicts } from '../core/harness-conflicts.js';
import { initProject, installGlobalSkills } from '../core/init.js';
import { context7ConfigToml, DOLLAR_SKILL_NAMES, GETDESIGN_REFERENCE, hasContext7ConfigText, RECOMMENDED_SKILLS } from '../core/routes.js';
import { checkZellijCapability } from '../core/zellij/zellij-capability.js';
import { reconcileCodexAppUpgradeProcesses } from '../core/codex-app.js';
import { restartCodexApp } from '../core/codex-app/codex-app-restart.js';
import { cleanupMacLaunchSecretEnvironment } from '../core/codex-app/sks-menubar.js';
import { recordCodexLbHealthEvent } from '../core/codex-lb-circuit.js';
import { loadCodexLbEnv, writeCodexLbKeychain, codexLbMetadataPath } from '../core/codex-lb/codex-lb-env.js';
import {
  GLM_CODEX_CONFIG_PROFILE_ID,
  GLM_CODEX_CONFIG_PROVIDER_ID,
  GLM_CODEX_CONFIG_REASONING_PROFILES
} from '../core/providers/glm/glm-52-profile.js';
import { GLM_52_OPENROUTER_MODEL } from '../core/providers/glm/glm-52-settings.js';
import {
  buildCodexLbSetupPlan,
  codexLbPersistenceSummary,
  installCodexLbShellProfileSnippet,
  selectedCodexLbPersistenceModes,
  type CodexLbPersistenceSummary,
  type CodexLbPersistenceMode
} from '../core/codex-lb/codex-lb-setup.js';
import { extractTomlTable, writeCodexConfigGuarded } from '../core/codex/codex-config-guard.js';
import { cleanupCodexConfigBackups, validateCodexConfigRoundTrip } from '../core/codex/codex-config-toml.js';
import { runPostinstallGlobalDoctorAndMarkPending } from '../core/update/update-migration-state.js';
import { repairCodexImagegen } from '../core/doctor/imagegen-repair.js';
import { REQUIRED_CODEX_MODEL } from '../core/codex-model-guard.js';

type CodexLbStatusSnapshot = Awaited<ReturnType<typeof codexLbStatus>>;

const CODEX_LB_PROVIDER_NAME = 'openai';
const CODEX_LB_PROVIDER_ENV_KEY = 'CODEX_LB_API_KEY';
const CODEX_LB_CANONICAL_FAST_SERVICE_TIER = 'priority';

/** Install-time shim reconciliation; fields vary by `status`. */
export type SksPostinstallShimResult = {
  status: string;
  command?: string;
  repaired?: Array<{ path: string; name?: string; previous_version?: unknown; target?: unknown; error?: string }>;
  failed?: unknown[];
  reason?: string;
  error?: string;
};

export type CodexLbAuthReconcileResult = {
  status: string;
  reason?: string;
  auth_path?: string;
  backup_path?: string;
  error?: string;
};

export type CodexLbEnvSyncResult = {
  ok: boolean;
  status: string;
  env_path?: string;
  base_url?: string | null;
  launch_environment?: Record<string, unknown>;
  error?: string | null;
  skipped?: boolean;
  reason?: string;
};

export type CodexLbLoginSyncResult = {
  ok: boolean;
  status: string;
  reason?: string;
  error?: string | null;
};

export type CodexLbAuthInstallResult = {
  status: string;
  ok?: boolean;
  reason?: string;
  legacy_auth_migrated?: boolean;
  legacy_auth_path?: string | null;
  config_path?: string;
  env_path?: string;
  base_url?: string | null;
  config_repaired?: boolean;
  codex_lb?: CodexLbStatusSnapshot;
  codex_environment?: CodexLbEnvSyncResult;
  codex_login?: CodexLbLoginSyncResult;
  auth_reconcile?: CodexLbAuthReconcileResult;
  error?: string | null;
};

export type ConfigureCodexLbResult = {
  ok?: boolean;
  status: string;
  plan?: Record<string, unknown>;
  applied_actions?: Array<Record<string, unknown>>;
  drift?: string[];
  persistence?: CodexLbPersistenceSummary;
  config_path?: string;
  env_path?: string;
  metadata_path?: string;
  backup_path?: string | null;
  base_url?: string;
  env_key?: string;
  keychain?: Record<string, unknown>;
  warnings?: string[];
  auth_reconcile?: CodexLbAuthReconcileResult;
  codex_lb?: CodexLbStatusSnapshot;
  codex_environment?: CodexLbEnvSyncResult;
  codex_login?: CodexLbLoginSyncResult;
  error?: string | null;
  chain_health?: { status?: string } & Record<string, unknown>;
  bypass_codex_lb?: boolean;
  repair?: CodexLbAuthInstallResult;
} & Partial<CodexLbStatusSnapshot>;

export type CodexLbLaunchPromptResult = ConfigureCodexLbResult;

const DEFAULT_CODEX_APP_PLUGINS = [
  ['browser', 'openai-bundled'],
  ['chrome', 'openai-bundled'],
  ['computer-use', 'openai-bundled'],
  ['latex', 'openai-bundled'],
  ['documents', 'openai-primary-runtime'],
  ['presentations', 'openai-primary-runtime'],
  ['spreadsheets', 'openai-primary-runtime']
];

function packagedSksEntrypoint() {
  return path.join(packageRoot(), 'dist', 'bin', 'sks.js');
}

export async function postinstall({ bootstrap, args = [] }: any) {
  const installRoot = path.resolve(process.env.INIT_CWD || process.cwd());
  const conflictScan = await scanHarnessConflicts(installRoot);
  if (conflictScan.hard_block) {
    await postinstallHarnessConflictNotice(conflictScan);
    return;
  }
  const codexLbConfigSnapshot = await capturePostinstallCodexLbConfigSnapshot();
  // A failed setup side-effect must never fail `npm i`. Wrap the whole flow; always
  // restore the codex-lb snapshot in finally (even on the early bootstrap return / on throw).
  try {
  console.log('\nSKS installed.');
  // The published tarball deliberately excludes dist/.sks-build-stamp.json
  // (package.json files: "!dist/.sks-build-stamp.json"), but `sks update`
  // self-verification requires a version-matching stamp inside the installed
  // package. Regenerate it here so npm installs are verifiable; never
  // overwrite an existing stamp (in a dev checkout the build writes the real
  // one, and re-stamping against the current source tree would mask a stale
  // dist).
  try {
    const stampLib: any = await import('../scripts/lib/ensure-dist-fresh.js');
    await fsp.access(stampLib.distStampPath).catch(async () => {
      await fsp.writeFile(stampLib.distStampPath, `${JSON.stringify(stampLib.buildStampPayload(), null, 2)}\n`);
      console.log('SKS build stamp: restored for update self-verification (npm packages ship without it).');
    });
  } catch (err: any) {
    console.log(`SKS build stamp: could not restore (${err?.message || err}); \`sks update\` self-verification may report dist_stamp missing.`);
  }
  const shim = await ensureSksCommandDuringInstall();
  if (shim.status === 'present') console.log(`SKS command: available (${shim.command ?? 'unknown'}).`);
  else if (shim.status === 'repaired') console.log(`SKS command: stale PATH shim repaired (${shim.command ?? 'unknown'}).`);
  else if (shim.status === 'created') console.log(`SKS command: shim created at ${shim.command ?? 'unknown'}.`);
  else if (shim.status === 'created_not_on_path') console.log(`SKS command: shim created at ${shim.command ?? 'unknown'}. Add ${path.dirname(shim.command ?? '')} to PATH, or run npx -y -p sneakoscope sks.`);
  else if (shim.status === 'skipped') console.log(`SKS command: skipped (${shim.reason}).`);
  else console.log(`SKS command: shim unavailable. Use npx -y -p sneakoscope sks. ${shim.error || ''}`.trim());
  const context7Install = await ensureGlobalContext7DuringInstall();
  if (context7Install.status === 'present') console.log('Context7 MCP: already configured for Codex.');
  else if (context7Install.status === 'installed') console.log('Context7 MCP: configured for Codex.');
  else if (context7Install.status === 'codex_missing') console.log('Context7 MCP: Codex CLI missing. Install @openai/codex or set SKS_CODEX_BIN, then run `sks context7 setup --scope global` or `sks setup` in a project.');
  else if (context7Install.status === 'skipped') console.log(`Context7 MCP: skipped (${context7Install.reason}).`);
  else if (context7Install.status === 'failed') console.log(`Context7 MCP: auto setup failed. Run \`sks context7 setup --scope global\` or \`sks setup\`. ${context7Install.error || ''}`.trim());
  // xAI/Grok web search is an optional source-intelligence provider. It needs a
  // user-chosen MCP server + XAI_API_KEY, so we never auto-configure it — just make
  // it discoverable (the integration the operator otherwise can't find at install).
  console.log('xAI/Grok search (optional): add Grok Live Search with `sks xai setup` (then `export XAI_API_KEY=...`); see `sks xai docs`.');
  const fastModeRepair = await ensureGlobalCodexFastModeDuringInstall();
  if (fastModeRepair.status === 'updated') console.log(`Codex App Fast mode: updated ${fastModeRepair.config_path}${fastModeRepair.backup_path ? ` (backup ${fastModeRepair.backup_path})` : ''}.`);
  else if (fastModeRepair.status === 'present') console.log('Codex App Fast mode: config already compatible.');
  else if (fastModeRepair.status === 'unparseable_config_preserved') console.log(`Codex App Fast mode: existing ${fastModeRepair.config_path} is not valid TOML — left untouched, backed up to ${fastModeRepair.backup_path}. Run \`sks doctor --fix\` to recover it.`);
  else if (fastModeRepair.status === 'skipped_unsafe_rewrite') console.log(`Codex App Fast mode: skipped (managed rewrite would not parse; ${fastModeRepair.config_path} left untouched).`);
  else if (fastModeRepair.status === 'skipped') console.log(`Codex App Fast mode: skipped (${fastModeRepair.reason}).`);
  else if (fastModeRepair.status === 'failed') console.log(`Codex App Fast mode: auto repair failed. Run \`sks setup\`. ${fastModeRepair.error || ''}`.trim());
  const imagegenRepair = await ensureCodexImagegenDuringInstall();
  if (imagegenRepair.status === 'ready') console.log('Codex App Image Gen: ready ($imagegen/gpt-image-2 detected).');
  else if (imagegenRepair.status === 'recovered') console.log('Codex App Image Gen: recovered and re-detected.');
  else if (imagegenRepair.status === 'blocked') console.log(`Codex App Image Gen: blocked; run \`sks doctor --fix\`. ${(imagegenRepair.blockers || []).join(', ')}`.trim());
  else if (imagegenRepair.status === 'skipped') console.log(`Codex App Image Gen: skipped (${imagegenRepair.reason}).`);
  const postinstallDoctor = await runPostinstallGlobalDoctorAndMarkPending().catch((err: any) => ({
    ok: false,
    doctor: null,
    pending: null,
    blockers: [err?.message || String(err)],
    warnings: []
  }));
  if (postinstallDoctor.ok) console.log('SKS update migration: global Doctor ran; project receipt will be finalized on first normal command.');
  else console.log(`SKS update migration: global Doctor did not complete; first normal command will retry. ${(postinstallDoctor.blockers || []).join(', ')}`.trim());
  const postinstallRetention = await runPostinstallProjectRetentionCleanup(installRoot);
  if (postinstallRetention.status === 'completed' && postinstallRetention.action_count > 0) console.log(`SKS mission cleanup: removed ${postinstallRetention.action_count} disposable runtime artifact(s) from closed missions.`);
  else if (postinstallRetention.status === 'failed') console.log(`SKS mission cleanup: skipped (${postinstallRetention.error || 'cleanup failed'}).`);
  // Terminating a third-party app's processes during `npm i` is unsafe by default; opt-in only.
  const appProcessRepair: any = process.env.SKS_POSTINSTALL_RECONCILE_APP_PROCESSES === '1'
    ? await reconcileCodexAppUpgradeProcesses()
    : { status: 'skipped', reason: 'opt_in_required', killed: [] };
  if (appProcessRepair.status === 'repaired') console.log(`Codex App reconnect repair: stopped ${appProcessRepair.killed.length} stale orphan app-server process(es). Restart Codex App to reconnect cleanly.`);
  else if (appProcessRepair.status === 'partial') console.log(`Codex App reconnect repair: stopped ${appProcessRepair.killed.length} stale orphan app-server process(es); ${(appProcessRepair.failed ?? []).length} could not be stopped. Restart Codex App if reconnecting continues.`);
  else if (appProcessRepair.status === 'skipped' && appProcessRepair.reason === 'opt_in_required') console.log('Codex App reconnect repair: not run (set SKS_POSTINSTALL_RECONCILE_APP_PROCESSES=1 to allow postinstall to stop stale orphan app-server processes; otherwise run `sks doctor --fix`).');
  else if (appProcessRepair.status === 'skipped' && appProcessRepair.reason !== 'platform') console.log(`Codex App reconnect repair: skipped (${appProcessRepair.reason}).`);
  else if (appProcessRepair.status === 'failed') console.log(`Codex App reconnect repair: skipped (${appProcessRepair.error || appProcessRepair.reason || 'process check failed'}).`);
  const globalSkills = await ensureGlobalCodexSkillsDuringInstall();
  if (globalSkills.status === 'installed') {
    const removed = globalSkills.removed_stale_generated_skills || [];
    const cleanup = removed.length ? ` Removed stale generated skill shadow(s): ${removed.join(', ')}.` : '';
    console.log(`Codex App global $ skills: installed in ${globalSkills.root} (${globalSkills.installed_count} skills).${cleanup}`);
  }
  else if (globalSkills.status === 'partial') console.log(`Codex App global $ skills: partial in ${globalSkills.root}; missing ${(globalSkills.missing_skills ?? []).join(', ')}. Run \`sks doctor --fix\`.`);
  else if (globalSkills.status === 'skipped') console.log(`Codex App global $ skills: skipped (${globalSkills.reason}).`);
  else if (globalSkills.status === 'failed') console.log(`Codex App global $ skills: auto setup failed. Run \`sks doctor --fix\`. ${globalSkills.error || ''}`.trim());
  const getdesignSkill = await ensureGlobalGetdesignSkillDuringInstall();
  if (getdesignSkill.status === 'installed') console.log('getdesign Codex skill: installed.');
  else if (getdesignSkill.status === 'present') console.log('getdesign Codex skill: already available.');
  else if (getdesignSkill.status === 'skills_cli_missing') console.log(`getdesign Codex skill: skills CLI missing; generated getdesign-reference skill is installed. Later run \`${getdesignSkill.install}\` if the skills CLI is available.`);
  else if (getdesignSkill.status === 'skipped') console.log(`getdesign Codex skill: skipped (${getdesignSkill.reason}).`);
  else if (getdesignSkill.status === 'failed') console.log(`getdesign Codex skill: auto setup failed; generated getdesign-reference skill remains available. ${getdesignSkill.error || ''}`.trim());
  const bootstrapDecision = await postinstallBootstrapDecision(installRoot);
  if (bootstrapDecision.run) {
    console.log(`SKS bootstrap: ${bootstrapDecision.reason}.`);
    await runPostinstallBootstrap(installRoot, bootstrap);
    return;
  }
  console.log('\nNext:');
  console.log('  sks bootstrap');
  console.log(`\nSKS bootstrap was not run automatically: ${bootstrapDecision.reason}.`);
  console.log('This initializes the current project, installs SKS Codex App skills, verifies Codex App/Context7 readiness, and checks Zellij runtime dependencies.');
  console.log('Dependency repair: sks bootstrap --yes, sks deps check --yes, or sks --mad --yes. Postinstall reports missing CLI tools but does not mutate Homebrew/npm globals unless SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS=1 is set.');
  console.log('Open runtime after readiness is green: sks\n');
  } catch (err: any) {
    console.log(`\nSKS postinstall: a setup step did not complete; installation continues. Run \`sks doctor --fix\` afterward. (${err?.message || err})`);
  } finally {
    await restorePostinstallCodexLbConfigSnapshot(codexLbConfigSnapshot).catch(() => {});
    await reportPostinstallCodexLbAuth().catch(() => {});
  }
}

async function runPostinstallProjectRetentionCleanup(root: string) {
  const projectRoot = path.resolve(root || process.cwd());
  if (process.env.SKS_POSTINSTALL_RETENTION_CLEANUP === '0') {
    return { status: 'skipped', reason: 'disabled_by_env', action_count: 0 };
  }
  if (!(await exists(path.join(projectRoot, '.sneakoscope', 'missions')))) {
    return { status: 'skipped', reason: 'missions_missing', action_count: 0 };
  }
  try {
    const { enforceRetention } = await import('../core/retention.js');
    const result = await enforceRetention(projectRoot, {
      mode: 'postinstall_update',
      pruneReportLogs: true,
      policy: { max_tmp_age_hours: 0 }
    });
    return {
      status: 'completed',
      root: projectRoot,
      action_count: Array.isArray(result.actions) ? result.actions.length : 0
    };
  } catch (err: any) {
    return {
      status: 'failed',
      root: projectRoot,
      action_count: 0,
      error: err?.message || String(err)
    };
  }
}

async function reportPostinstallCodexLbAuth() {
  const codexLbAuth = await ensureCodexLbAuthDuringInstall();
  if (codexLbAuth.legacy_auth_migrated) console.log(`codex-lb auth: restored from existing Codex login cache into ${codexLbAuth.env_path}.`);
  else if (codexLbAuth.status === 'synced' || codexLbAuth.status === 'present' || codexLbAuth.status === 'repaired') console.log(`codex-lb auth: preserved from ${codexLbAuth.env_path}.`);
  else if (codexLbAuth.status === 'present_unselected') console.log('codex-lb auth: preserved but not selected; ChatGPT OAuth remains active.');
  else if (codexLbAuth.status === 'skipped') console.log(`codex-lb auth: skipped (${codexLbAuth.reason}).`);
  else if (codexLbAuth.status === 'missing_env_key') console.log('codex-lb auth: stored key missing. Run `sks codex-lb setup --host <domain> --api-key <key>` to repair.');
  else if (codexLbAuth.status === 'missing_base_url') console.log('codex-lb auth: stored key has no recoverable base URL. Run `sks codex-lb reconfigure --host <domain> --api-key <key>` once.');
  else if (codexLbAuth.status === 'not_configured') console.log('codex-lb (optional multi-account load balancer): not configured — opt in anytime with `sks codex-lb setup` (your choice; never applied automatically, never edits your Codex config without it). Swap key later: `sks codex-lb set-key`; switch auth: `sks codex-lb use-oauth` / `use-codex-lb`.');
  else if (codexLbAuth.status && codexLbAuth.status !== 'not_configured') console.log(`codex-lb auth: repair skipped (${codexLbAuth.status}${codexLbAuth.error ? `: ${codexLbAuth.error}` : ''}).`);
  const reconcile = codexLbAuth.auth_reconcile;
  if (reconcile?.status === 'oauth_preserved') {
    console.log(`codex-lb auth: ChatGPT OAuth preserved as backup; run \`sks codex-lb use-codex-lb\` to switch the App to codex-lb API-key auth (backup at ${reconcile.backup_path ?? 'unknown'}).`);
  } else if (reconcile?.status === 'oauth_restored') {
    console.log(`codex-lb auth: restored ChatGPT OAuth from ${reconcile.backup_path ?? 'unknown'} while keeping codex-lb selected.`);
  } else if (reconcile?.status === 'apikey_forced') {
    console.log(`codex-lb auth: forced API-key auth.json for CLI-only use (OAuth backup at ${reconcile.backup_path ?? 'unknown'}).`);
  } else if (reconcile?.status === 'backup_only') {
    console.log(`codex-lb auth: detected ChatGPT OAuth tokens in auth.json. OAuth backup written to ${reconcile.backup_path ?? 'unknown'}; auth.json left untouched because SKS_CODEX_LB_NO_AUTH_RECONCILE=1.`);
  } else if (reconcile?.status === 'failed') {
    console.log(`codex-lb auth: ChatGPT OAuth reconciliation could not complete (${reconcile.reason || 'unknown'}${reconcile.error ? `: ${reconcile.error}` : ''}). Run \`sks codex-lb repair\` to retry.`);
  }
  if (codexLbAuth.base_url && codexLbAuth.codex_lb?.env_key_configured && canAskYesNo() && process.env.SKS_SKIP_CODEX_LB_KEY_PROMPT !== '1') {
    const changeKey = (await askPostinstallQuestion('codex-lb key changed? Update now? [y/N] ')).trim();
    if (/^(y|yes|예|네|응)$/i.test(changeKey)) {
      const newKey = (await askPostinstallQuestion('New codex-lb API key (sk-clb-...): ')).trim();
      if (newKey) {
        const result = await configureCodexLb({ host: codexLbAuth.base_url, apiKey: newKey });
        if (result.ok) console.log(`codex-lb key updated: ${result.base_url}`);
        else console.log(`codex-lb key update failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
      }
    }
  }
  return codexLbAuth;
}

async function postinstallHarnessConflictNotice(conflictScan: any) {
  console.log('\nSneakoscope Codex package installed, but SKS setup is blocked.');
  console.log(formatHarnessConflictReport(conflictScan, { includePrompt: false }));
  console.log('\nWhat this means: npm can finish installing the package, but `sks setup` and `sks doctor --fix` will refuse to activate SKS until the conflicting harness is removed with human approval.');
  console.log('No files were removed by postinstall.');
  console.log(`Cleanup requires a human-approved Codex App session. Recommended model: ${REQUIRED_CODEX_MODEL}, reasoning: high.`);
  if (shouldAskPostinstallQuestion()) {
    const answer = await askPostinstallQuestion('Show the cleanup prompt now? [y/N] ');
    if (/^(y|yes|예|네|응)$/i.test(answer.trim())) {
      console.log('\nCleanup prompt:\n');
      console.log(llmHarnessCleanupPrompt(conflictScan));
    } else {
      console.log('Cleanup prompt skipped. You can print it later with: sks conflicts prompt');
    }
  } else {
    console.log('Print the cleanup prompt later with: sks conflicts prompt');
  }
  console.log('After approved cleanup, rerun: sks setup && sks doctor --fix && sks selftest --mock\n');
}

function shouldAskPostinstallQuestion() {
  if (process.env.SKS_POSTINSTALL_PROMPT === '1') return true;
  return Boolean(input.isTTY && output.isTTY && process.env.CI !== 'true' && process.env.SKS_POSTINSTALL_NO_PROMPT !== '1');
}

export async function postinstallBootstrapDecision(root: any) {
  if (process.env.SKS_POSTINSTALL_NO_BOOTSTRAP === '1') return { run: false, reason: 'SKS_POSTINSTALL_NO_BOOTSTRAP=1' };
  if (process.env.SKS_POSTINSTALL_BOOTSTRAP === '0') return { run: false, reason: 'SKS_POSTINSTALL_BOOTSTRAP=0' };
  const installRoot = path.resolve(root || process.cwd());
  const candidate = await isProjectSetupCandidate(installRoot);
  const target = candidate ? installRoot : globalSksRoot();
  if (process.env.SKS_POSTINSTALL_BOOTSTRAP === '1') return { run: true, target, reason: 'forced by SKS_POSTINSTALL_BOOTSTRAP=1' };
  // A global `npm i -g sneakoscope` must NOT initialize whatever project the user's shell
  // happened to be in (that would scribble AGENTS.md/.codex/.agents into an unrelated repo).
  // Only bootstrap the global runtime root; the user runs `sks setup` inside a project explicitly.
  if (process.env.npm_config_global === 'true' && candidate) {
    return { run: true, target: globalSksRoot(), reason: 'global install: bootstrapping global SKS runtime only (run `sks setup` inside a project to initialize it)' };
  }
  if (candidate) return { run: true, target, reason: 'auto-running sks setup --bootstrap --install-scope global --force' };
  return { run: true, target, reason: 'no project marker found; auto-running global SKS runtime bootstrap' };
}

async function runPostinstallBootstrap(root: any, bootstrap: any) {
  const previousCwd = process.cwd();
  const decision = await postinstallBootstrapDecision(root);
  const target = path.resolve(decision.target || root || previousCwd);
  await ensureDir(target);
  process.chdir(target);
  try {
    await bootstrap(['--from-postinstall', '--install-scope', 'global', '--force']);
  } finally {
    process.chdir(previousCwd);
  }
}

export async function askPostinstallQuestion(question: any) {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export function codexLbConfigPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'config.toml');
}

export function codexLbEnvPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'sks-codex-lb.env');
}

function codexAuthPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'auth.json');
}

function codexAuthChatgptBackupPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'auth.chatgpt-backup.json');
}

async function capturePostinstallCodexLbConfigSnapshot(home: any = process.env.HOME || os.homedir()) {
  const configPath = codexLbConfigPath(home);
  const envPath = codexLbEnvPath(home);
  const authPath = codexAuthPath(home);
  const config = await readText(configPath, '');
  const envText = await readText(envPath, '');
  const authExisted = await exists(authPath);
  const authText = authExisted ? await readText(authPath, '') : '';
  const envKey = parseCodexLbEnvKey(envText);
  const providerConfigured = /\[model_providers\.codex-lb\]/.test(config);
  const baseUrl = codexLbProviderBaseUrl(config) || parseCodexLbEnvBaseUrl(envText);
  // Snapshot any codex-lb-related state so the upgrade-time bootstrap can't silently undo it.
  if (!envKey && !providerConfigured && !authExisted) return null;
  return {
    config_path: configPath,
    env_path: envPath,
    auth_path: authPath,
    base_url: baseUrl ? normalizeCodexLbBaseUrl(baseUrl) : null,
    selected: hasTopLevelCodexLbSelected(config),
    auth_existed: authExisted,
    auth_text: authText
  };
}

async function restorePostinstallCodexLbConfigSnapshot(snapshot: any) {
  if (!snapshot) return { status: 'skipped', reason: 'no_snapshot' };
  let configRestored = false;
  if (snapshot.base_url) {
    const current = await readText(snapshot.config_path, '');
    const next = normalizeCodexFastModeUiConfig(upsertCodexLbConfig(current, snapshot.base_url, snapshot.selected === true));
    const alreadyOk = next === ensureTrailingNewline(current) && codexLbProviderBaseUrl(current);
    if (!alreadyOk) {
      const safeWrite = await safeWriteCodexConfigToml(snapshot.config_path, current, next, 'codex-lb-restore');
      configRestored = safeWrite.ok && safeWrite.changed === true;
    }
  }
  // Restore auth.json only if bootstrap accidentally wiped or emptied a pre-existing auth.json.
  // We do NOT clobber a legitimately rewritten auth.json; we just heal the disappearing-auth regression.
  let authRestored = false;
  if (snapshot.auth_existed && snapshot.auth_text && snapshot.auth_text.trim()) {
    const currentAuthExists = await exists(snapshot.auth_path);
    const currentAuthText = currentAuthExists ? await readText(snapshot.auth_path, '') : '';
    if (!currentAuthExists || !currentAuthText.trim()) {
      await ensureDir(path.dirname(snapshot.auth_path));
      await writeTextAtomic(snapshot.auth_path, snapshot.auth_text);
      await fsp.chmod(snapshot.auth_path, 0o600).catch(() => {});
      authRestored = true;
    }
  }
  return {
    status: configRestored || authRestored ? 'restored' : 'present',
    config_path: snapshot.config_path,
    auth_path: snapshot.auth_path,
    config_restored: configRestored,
    auth_restored: authRestored
  };
}

export function normalizeCodexLbBaseUrl(input: any = '') {
  let host = String(input || '').trim();
  if (!host) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) host = `https://${host}`;
  host = host.replace(/\/+$/, '');
  return /\/backend-api\/codex$/i.test(host) ? host : `${host}/backend-api/codex`;
}

export async function configureCodexLb(opts: any = {}): Promise<ConfigureCodexLbResult> {
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  const envPath = opts.envPath || codexLbEnvPath(home);
  const rawHost = String(opts.host || opts.baseUrl || '');
  const baseUrl = normalizeCodexLbBaseUrl(rawHost);
  const apiKey = String(opts.apiKey || '').trim();
  const useDefaultProvider = opts.useDefaultProvider !== false;
  const writeEnvFile = opts.writeEnvFile !== false;
  const storeKeychain = opts.storeKeychain === true || opts.keychain === true;
  const syncLaunchctl = opts.syncLaunchctl === true || opts.syncLaunchEnv === true;
  const shellProfile = opts.shellProfile || 'skip';
  const setupAnswers = {
    host_or_base_url: rawHost,
    api_key_source: opts.apiKeySource || 'cli_option',
    use_as_default_provider: useDefaultProvider,
    write_env_file: writeEnvFile,
    store_keychain: storeKeychain,
    sync_launchctl: syncLaunchctl,
    install_shell_profile: shellProfile,
    run_health_check: opts.runHealth === true,
    allow_insecure_localhost: opts.allowInsecureHttp === true || opts.allowInsecureLocalhost === true
  };
  const selectedPersistenceModes = selectedCodexLbPersistenceModes(setupAnswers as any);
  const plan = buildCodexLbSetupPlan(setupAnswers as any, {
    home,
    configPath,
    envPath,
    metadataPath: opts.metadataPath || codexLbMetadataPath(home)
  });
  if (!baseUrl) return { ok: false, status: 'missing_host_or_base_url', config_path: configPath, env_path: envPath };
  if (plan.blockers.length) return { ok: false, status: 'plan_blocked', plan: plan as any, drift: plan.blockers, config_path: configPath, env_path: envPath };
  if (/[\u0000-\u001f\u007f\s]/.test(rawHost.trim())) return { ok: false, status: 'invalid_host_or_base_url', config_path: configPath, env_path: envPath, error: 'host_or_base_url_contains_whitespace_or_control_character' };
  if (!apiKey) return { ok: false, status: 'missing_api_key', config_path: configPath, env_path: envPath };
  const insecureLocalWarning = /^http:\/\//i.test(baseUrl) && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(baseUrl) && !opts.allowInsecureHttp
    ? ['codex-lb base URL uses http outside localhost; prefer https or pass an explicit allow flag in the calling surface.']
    : [];
  const beforeState = await captureCodexLbSetupWriteState({ home, configPath, envPath, shellProfile });
  const appliedActions: Array<Record<string, unknown>> = [];
  await ensureDir(path.dirname(configPath));
  const current = await readText(configPath, '');
  const next = normalizeCodexFastModeUiConfig(upsertCodexLbConfig(current, baseUrl, useDefaultProvider), {
    forceFastMode: opts.forceFastMode !== false
  });
  const safeWrite = await safeWriteCodexConfigToml(configPath, current, next, 'codex-lb');
  if (!safeWrite.ok) return { ok: false, status: safeWrite.status, config_path: configPath, env_path: envPath, backup_path: safeWrite.backup_path };
  appliedActions.push({ type: 'write_config_provider', target: configPath, ok: true, backup_path: safeWrite.backup_path });
  if (useDefaultProvider) appliedActions.push({ type: 'select_default_provider', target: configPath, ok: true });
  if (writeEnvFile) {
    await writeTextAtomic(envPath, `export CODEX_LB_BASE_URL=${shellSingleQuote(baseUrl)}\nexport CODEX_LB_API_KEY=${shellSingleQuote(apiKey)}\n`);
    await fsp.chmod(envPath, 0o600).catch(() => {});
    appliedActions.push({ type: 'write_env_file', target: envPath, ok: true });
  }
  process.env.CODEX_LB_BASE_URL = baseUrl;
  process.env.CODEX_LB_API_KEY = apiKey;
  const keyFingerprint = await sha256Text(apiKey);
  const metadataPath = opts.metadataPath || codexLbMetadataPath(home);
  await writeTextAtomic(metadataPath, `${JSON.stringify({
    schema: 'sks.codex-lb-metadata.v1',
    base_url: baseUrl,
    updated_at: new Date().toISOString(),
    source: opts.source || 'setup',
    api_key: { redacted: true, sha256: keyFingerprint }
  }, null, 2)}\n`);
  await fsp.chmod(metadataPath, 0o600).catch(() => {});
  appliedActions.push({ type: 'write_metadata', target: metadataPath, ok: true });
  const keychain = storeKeychain ? await writeCodexLbKeychain(apiKey, opts).catch((err: any) => ({ ok: false, status: 'keychain_store_failed', error: err.message })) : { ok: false, status: 'skipped' };
  if (storeKeychain) appliedActions.push({ type: 'store_keychain', target: 'macOS Keychain service sks-codex-lb', ok: keychain.ok === true, status: keychain.status });
  const codexEnvironment = await syncCodexLbProviderEnvironment({ env_path: envPath, base_url: baseUrl }, { ...opts, home, apiKey, baseUrl, syncLaunchEnv: syncLaunchctl });
  if (syncLaunchctl) appliedActions.push({ type: 'sync_launchctl', target: 'macOS launchctl user environment (base URL only; API-key env removed)', ok: codexEnvironment.ok === true, status: codexEnvironment.status });
  const shellProfileResult = await installCodexLbShellProfileSnippet({ home, envPath, shellProfile }).catch((err: any) => ({ ok: false, status: 'failed', files: [], error: err.message }));
  if (shellProfile !== 'skip') appliedActions.push({ type: 'install_shell_profile_snippet', target: shellProfileResult.files?.join(', ') || shellProfile, ok: shellProfileResult.ok === true, status: shellProfileResult.status });
  const codexLb = await codexLbStatus({ ...opts, home, configPath, envPath });
  const forceCodexLbApiKeyAuth = opts.forceCodexLbApiKeyAuth === true || opts.authMode === 'codex-lb';
  const authReconcile = await reconcileCodexLbAuthConflict({ ...opts, home, status: codexLb, forceCodexLbApiKeyAuth }).catch((err: any) => ({ status: 'failed', reason: 'exception', error: err.message }));
  const codexLogin = forceCodexLbApiKeyAuth
    ? { ok: ['apikey_forced', 'apikey_auth_active'].includes(authReconcile.status), status: authReconcile.status, ...(authReconcile.reason ? { reason: authReconcile.reason } : {}), error: authReconcile.error || null }
    : await maybeSyncCodexLbSharedLogin(apiKey, { ...opts, home, force: true });
  const finalCodexLb = await codexLbStatus({ ...opts, home, configPath, envPath });
  const ok = Boolean(codexEnvironment.ok && codexLogin.ok);
  const afterState = await captureCodexLbSetupWriteState({ home, configPath, envPath, shellProfile });
  const drift = detectCodexLbSetupDrift({
    useDefaultProvider,
    writeEnvFile,
    storeKeychain,
    syncLaunchctl,
    shellProfile,
    selected: finalCodexLb.selected,
    envFile: finalCodexLb.env_file,
    keychain,
    codexEnvironment,
    shellProfileResult,
    beforeState,
    afterState
  });
  const appliedPersistenceModes = appliedCodexLbPersistenceModes({
    writeEnvFile,
    storeKeychain,
    syncLaunchctl,
    shellProfile,
    envFile: finalCodexLb.env_file,
    keychain,
    codexEnvironment,
    shellProfileResult,
    apiKeySource: finalCodexLb.env_loader?.api_key?.source || null
  });
  const persistence = codexLbPersistenceSummary({
    selectedModes: selectedPersistenceModes,
    appliedModes: appliedPersistenceModes,
    processOnly: appliedPersistenceModes.includes('process_only_ephemeral')
  });
  const warnings = [...insecureLocalWarning, ...persistence.warnings];
  return {
    ok: ok && drift.length === 0,
    status: ok && drift.length === 0 ? 'configured' : drift.length ? 'setup_choice_drift' : (codexEnvironment.status || codexLogin.status),
    plan: plan as any,
    applied_actions: appliedActions,
    drift,
    persistence,
    config_path: configPath,
    env_path: envPath,
    metadata_path: metadataPath,
    base_url: baseUrl,
    env_key: 'CODEX_LB_API_KEY',
    keychain,
    warnings,
    auth_reconcile: authReconcile,
    codex_lb: finalCodexLb,
    codex_environment: codexEnvironment,
    codex_login: codexLogin,
    error: authReconcile.error || codexEnvironment.error || codexLogin.error || null
  };
}

export async function codexLbStatus(opts: any = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  const envPath = opts.envPath || codexLbEnvPath(home);
  const config = await readText(configPath, '');
  const envExists = await exists(envPath);
  const envText = envExists ? await readText(envPath, '') : '';
  const envLoad = await loadCodexLbEnv({ ...opts, home, envPath });
  const authPath = opts.authPath || codexAuthPath(home);
  const authText = await readText(authPath, '');
  const authMode = codexAuthModeSummary(authText);
  const envKeyConfigured = Boolean(envLoad.api_key.present);
  const providerConfigured = /\[model_providers\.codex-lb\]/.test(config);
  const selected = hasTopLevelCodexLbSelected(config);
  const baseUrl = codexLbProviderBaseUrl(config) || envLoad.base_url || null;
  const providerName = codexLbProviderName(config);
  const providerWireApi = codexLbProviderWireApi(config);
  const providerSupportsWebsockets = codexLbProviderSupportsWebsockets(config);
  const providerRequiresOpenAiAuth = codexLbProviderRequiresOpenAiAuth(config);
  const providerOpenAiAuthDisabled = codexLbProviderOpenAiAuthDisabled(config);
  const providerEnvKey = codexLbProviderEnvKey(config);
  const providerContractOk = providerConfigured
    && providerName === CODEX_LB_PROVIDER_NAME
    && providerWireApi === 'responses'
    && providerEnvKey === CODEX_LB_PROVIDER_ENV_KEY
    && providerSupportsWebsockets === true
    && providerRequiresOpenAiAuth === true;
  const providerUsesCodexLbEnvAuth = providerConfigured && providerEnvKey === CODEX_LB_PROVIDER_ENV_KEY && providerOpenAiAuthDisabled;
  const codexAppUsableWithCodexLb = providerContractOk && envKeyConfigured && Boolean(baseUrl) && authMode.codex_app_usable;
  const fastMode = codexLbFastModeConfigStatus(config);
  const launchEnvironment = await inspectCodexLbMacLaunchEnvironment(baseUrl, opts).catch((err: any) => ({
    checked: true,
    available: false,
    status: 'inspect_failed',
    error: err.message
  }));
  return {
    ok: providerContractOk && envKeyConfigured && Boolean(baseUrl) && authMode.codex_app_usable,
    config_path: configPath,
    env_path: envPath,
    provider_configured: providerConfigured,
    provider_name: providerName || null,
    provider_wire_api: providerWireApi || null,
    provider_supports_websockets: providerSupportsWebsockets,
    provider_contract_ok: providerContractOk,
    provider_requires_openai_auth: providerRequiresOpenAiAuth,
    provider_openai_auth_disabled: providerOpenAiAuthDisabled,
    provider_env_key: providerEnvKey || null,
    provider_uses_codex_lb_env_auth: providerUsesCodexLbEnvAuth,
    selected,
    env_file: envExists,
    env_key_configured: envKeyConfigured,
    env_base_url_configured: Boolean(envLoad.base_url),
    env_loader: {
      configured: envLoad.configured,
      missing: envLoad.missing,
      source: envLoad.source,
      source_priority: envLoad.source_priority,
      api_key: envLoad.api_key,
      keychain: envLoad.keychain,
      env_paths: envLoad.env_paths
    },
    base_url: baseUrl,
    auth_path: authPath,
    auth_mode: authMode.mode,
    auth_usable_for_codex_app: authMode.codex_app_usable || codexAppUsableWithCodexLb,
    auth_summary: codexAppUsableWithCodexLb ? `codex-lb provider uses ${authMode.mode} OpenAI-style auth through Codex App` : authMode.summary,
    fast_mode: fastMode,
    launch_environment: launchEnvironment
  };
}

export function formatCodexLbStatusText(status: any = {}, opts: any = {}) {
  const backupPresent = Boolean(opts.backupPresent);
  const backupPath = opts.backupPath || '';
  const lines = [
    'SKS codex-lb',
    '',
    `Configured: ${status.ok ? 'yes' : 'no'}`,
    `Selected:   ${status.selected ? 'yes' : 'no'}`,
    `Provider:   ${status.provider_contract_ok ? 'codex-lb App contract ok' : status.provider_configured ? 'drifted' : 'missing'}`,
    `Provider OpenAI Auth: ${status.provider_requires_openai_auth ? 'required' : 'not required/drifted'} (${status.provider_name || 'missing'})`,
    `Codex App auth: ${status.auth_usable_for_codex_app ? 'ok' : 'needs sign-in/repair'} (${status.auth_mode || 'unknown'})`
  ];
  if (status.auth_summary) lines.push(`Auth detail: ${status.auth_summary}`);
  if (status.fast_mode) {
    const fast = status.fast_mode;
    lines.push(`Fast Mode: ${fast.configured ? `configured request=${fast.codex_request_service_tier} upstream=${fast.codex_lb_upstream_service_tier}` : 'not configured'}`);
    if (!fast.actual_service_tier_verified) lines.push(`Fast proof: unverified until ${fast.proof_required}. Run: ${fast.verification_command}`);
  }
  lines.push(`Env file:   ${status.env_file ? status.env_path : 'missing'}`);
  if (status.base_url) lines.push(`Base URL:   ${status.base_url}`);
  lines.push(`ChatGPT backup: ${backupPresent ? `yes (${backupPath})` : 'no'}`);
  if (status.provider_configured && !status.provider_contract_ok) lines.push('', 'Run: sks codex-lb repair to rewrite the provider block to the current codex-lb App contract.');
  else if (status.ok && !status.auth_usable_for_codex_app && backupPresent) lines.push('', 'Run: sks codex-lb use-oauth to restore ChatGPT OAuth, or sks codex-lb use-codex-lb to force codex-lb API-key auth.');
  else if (status.ok && !status.auth_usable_for_codex_app) lines.push('', 'Run: sks codex-lb use-codex-lb, or sign in to Codex App/CLI again for ChatGPT OAuth.');
  else if (status.ok && !status.selected) lines.push('', 'Run: sks codex-lb repair to activate codex-lb for Codex App.');
  else if (status.ok) lines.push('', 'Status: codex-lb active; no repair needed.');
  else if (!status.ok && status.base_url && status.env_key_configured) lines.push('', 'Run: sks codex-lb repair to restore the upstream codex-lb provider block.');
  else if (!status.ok) lines.push('', 'Run: sks codex-lb setup --host <domain> --api-key <key>');
  if (backupPresent) lines.push('Switch fully away from codex-lb: sks codex-lb release');
  return `${lines.join('\n')}\n`;
}

export function formatCodexLbRepairResultText(result: any = {}) {
  const lines = [
    'codex-lb provider auth repaired for Codex CLI/App environment.',
    `Config: ${result.config_path}`,
    `Key env: ${result.env_path}`
  ];
  if (result.auth_reconcile?.status === 'oauth_restored') lines.push(`Codex App auth: ChatGPT OAuth restored from ${result.auth_reconcile.backup_path}.`);
  else if (result.auth_reconcile?.status === 'oauth_preserved') lines.push('Codex App auth: ChatGPT OAuth preserved as backup; run `sks codex-lb use-codex-lb` to force codex-lb API-key auth.');
  else if (['apikey_auth_active', 'apikey_forced'].includes(result.auth_reconcile?.status)) lines.push('Codex App auth: codex-lb API-key auth.json is active.');
  return `${lines.join('\n')}\n`;
}

function codexLbResponsesEndpoint(baseUrl: any = '') {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return /\/responses$/i.test(base) ? base : `${base}/responses`;
}

function codexLbChainCheckEnabled(env: any = process.env) {
  return env.SKS_CODEX_LB_CHAIN_CHECK !== '0' && env.SKS_SKIP_CODEX_LB_CHAIN_CHECK !== '1';
}

function codexLbChainCachePath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'sks-codex-lb-chain-health.json');
}

function codexLbChainCacheTtlMs(status: any = '', env: any = process.env) {
  const hardFailure = Boolean(status && !['chain_ok', 'previous_response_not_found'].includes(status));
  const key = hardFailure ? 'SKS_CODEX_LB_CHAIN_CHECK_FAILURE_CACHE_TTL_MS' : 'SKS_CODEX_LB_CHAIN_CHECK_CACHE_TTL_MS';
  const fallback = hardFailure ? 30 * 1000 : 5 * 60 * 1000;
  const raw = env[key] ?? env.SKS_CODEX_LB_CHAIN_CHECK_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function codexLbChainCacheEnabled(opts: any = {}, env: any = process.env) {
  if (opts.force || opts.cache === false) return false;
  if (opts.fetch) return false;
  if (env.SKS_CODEX_LB_CHAIN_CHECK_CACHE === '0') return false;
  return true;
}

async function readCodexLbChainCache({ endpoint, home, opts = {}, env = process.env }: any = {}) {
  if (!endpoint || !codexLbChainCacheEnabled(opts, env)) return null;
  const cachePath = opts.cachePath || codexLbChainCachePath(home || env.HOME || os.homedir());
  const text = await readText(cachePath, '');
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.schema !== 'sks.codex-lb-chain-health.v1' || parsed.endpoint !== endpoint || !parsed.result?.status) return null;
    const now = typeof opts.now === 'function' ? opts.now() : Date.now();
    const checkedAt = Number(parsed.checked_at_ms || 0);
    const ttlMs = codexLbChainCacheTtlMs(parsed.result.status, env);
    if (!checkedAt || ttlMs <= 0 || now - checkedAt > ttlMs) return null;
    return {
      ...parsed.result,
      endpoint,
      cached: true,
      cache_path: cachePath,
      cache_age_ms: Math.max(0, now - checkedAt)
    };
  } catch {
    return null;
  }
}

async function writeCodexLbChainCache(result: any = {}, { endpoint, home, opts = {}, env = process.env }: any = {}) {
  if (!endpoint || !result.status || !codexLbChainCacheEnabled(opts, env)) return result;
  const cachePath = opts.cachePath || codexLbChainCachePath(home || env.HOME || os.homedir());
  const now = typeof opts.now === 'function' ? opts.now() : Date.now();
  const cacheResult = {
    ok: Boolean(result.ok),
    status: result.status,
    chain_unhealthy: result.chain_unhealthy === true,
    http_status: result.http_status || null,
    error: result.error || null
  };
  try {
    await ensureDir(path.dirname(cachePath));
    await writeTextAtomic(cachePath, `${JSON.stringify({
      schema: 'sks.codex-lb-chain-health.v1',
      endpoint,
      checked_at_ms: now,
      result: cacheResult
    }, null, 2)}\n`);
    await fsp.chmod(cachePath, 0o600).catch(() => {});
  } catch {
    // Cache writes are a launch optimization only; never block codex-lb startup.
  }
  return result;
}

function isPreviousResponseNotFound(payload: any = {}) {
  const error = payload?.error || payload?.response?.error || payload;
  const text = typeof error === 'string'
    ? error
    : [error?.type, error?.code, error?.message, error?.param, JSON.stringify(error || {})].filter(Boolean).join(' ');
  return /previous_response_not_found|previous_response_id.*not found|previous_response_id/i.test(text);
}

function parseCodexLbSseEvents(text: any = '') {
  const events: any[] = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      events.push(JSON.parse(data));
    } catch {}
  }
  return events;
}

function codexLbResponseId(payload: any = {}) {
  if (typeof payload?.id === 'string' && payload.id) return payload.id;
  if (typeof payload?.response?.id === 'string' && payload.response.id) return payload.response.id;
  if (typeof payload?.data?.id === 'string' && payload.data.id) return payload.data.id;
  if (typeof payload?.data?.response?.id === 'string' && payload.data.response.id) return payload.data.response.id;
  return null;
}

function codexLbResponseError(json: any, events: any = []) {
  if (json?.error) return json;
  for (const event of events) {
    if (event?.error || event?.response?.error || event?.type === 'response.failed' || event?.type === 'error') return event;
  }
  return null;
}

function codexLbServiceTierEvidence(...responses: any[]) {
  const values: any[] = [];
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    values.push(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const response of responses) {
    visit(response?.json);
    visit(response?.events);
  }
  const firstString = (...keys: string[]) => {
    for (const row of values) {
      for (const key of keys) {
        const value = row?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
      }
    }
    return null;
  };
  const requested = firstString('requestedServiceTier', 'requested_service_tier', 'requested_serviceTier');
  const actual = firstString('actualServiceTier', 'actual_service_tier', 'actual_serviceTier');
  const effective = firstString('serviceTier', 'service_tier');
  return {
    requested_service_tier: requested,
    actual_service_tier: actual,
    effective_service_tier: effective,
    fast_requested: requested === CODEX_LB_CANONICAL_FAST_SERVICE_TIER || effective === CODEX_LB_CANONICAL_FAST_SERVICE_TIER,
    fast_actual: actual === CODEX_LB_CANONICAL_FAST_SERVICE_TIER || effective === CODEX_LB_CANONICAL_FAST_SERVICE_TIER
  };
}

async function fetchCodexLbResponse(fetchImpl: any, endpoint: any, apiKey: any, body: any, timeoutMs: any) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs).unref?.();
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    const events = json ? [] : parseCodexLbSseEvents(text);
    const responseId = codexLbResponseId(json) || events.map((event: any) => codexLbResponseId(event)).find(Boolean) || null;
    const errorPayload = codexLbResponseError(json, events);
    return { ok: response.ok && !errorPayload, status: response.status, json, text, events, response_id: responseId, error_payload: errorPayload };
  } catch (err: any) {
    return { ok: false, status: 0, json: null, text: err.name === 'AbortError' ? 'request timed out' : err.message, events: [], response_id: null, error_payload: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkCodexLbResponseChain(status: any = {}, opts: any = {}) {
  const env = opts.env || process.env;
  if (!codexLbChainCheckEnabled(env) && !opts.force) return { ok: true, status: 'skipped', skipped: true, reason: 'SKS_CODEX_LB_CHAIN_CHECK=0' };
  const endpoint = codexLbResponsesEndpoint(opts.baseUrl || status.base_url);
  if (!endpoint) return recordCodexLbChainHealth({ ok: false, status: 'missing_base_url', chain_unhealthy: true }, opts);
  const home = opts.home || env.HOME || os.homedir();
  const apiKey = opts.apiKey || parseCodexLbEnvKey(await readText(opts.envPath || status.env_path || codexLbEnvPath(home), ''));
  if (!apiKey) return recordCodexLbChainHealth({ ok: false, status: 'missing_env_key', chain_unhealthy: true }, opts);
  const cached = await readCodexLbChainCache({ endpoint, home, opts, env });
  if (cached) return cached;
  const fetchImpl = opts.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { ok: true, status: 'skipped', skipped: true, reason: 'fetch unavailable' };
  const model = opts.model || env.SKS_CODEX_MODEL || REQUIRED_CODEX_MODEL;
  const timeoutMs = Number(opts.timeoutMs || env.SKS_CODEX_LB_CHAIN_CHECK_TIMEOUT_MS || 8000);
  const serviceTier = opts.fastMode === true || opts.serviceTier === 'fast' || opts.serviceTier === CODEX_LB_CANONICAL_FAST_SERVICE_TIER
    ? CODEX_LB_CANONICAL_FAST_SERVICE_TIER
    : null;
  const baseBody = {
    model,
    instructions: 'You are running a short SKS codex-lb response-chain health check.',
    input: 'SKS codex-lb response-chain health check. Reply with OK.',
    ...(serviceTier ? { service_tier: serviceTier } : {}),
    stream: true,
    store: true,
    parallel_tool_calls: false,
    tool_choice: 'auto',
    reasoning: { effort: 'low' }
  };
  const first = await fetchCodexLbResponse(fetchImpl, endpoint, apiKey, baseBody, timeoutMs);
  if (!first.ok || !first.response_id) {
    return recordCodexLbChainHealth(await writeCodexLbChainCache({
      ok: false,
      status: first.ok ? 'missing_response_id' : 'first_request_failed',
      chain_unhealthy: true,
      endpoint,
      http_status: first.status,
      requested_service_tier: serviceTier,
      service_tier_evidence: codexLbServiceTierEvidence(first),
      error: redactSecretText(first.error_payload?.error?.message || first.error_payload?.response?.error?.message || first.text || 'codex-lb first Responses request failed', [apiKey])
    }, { endpoint, home, opts, env }), opts);
  }
  const second = await fetchCodexLbResponse(fetchImpl, endpoint, apiKey, { ...baseBody, previous_response_id: first.response_id }, timeoutMs);
  if (second.ok) return recordCodexLbChainHealth(await writeCodexLbChainCache({ ok: true, status: 'chain_ok', endpoint, response_id: first.response_id, chained_response_id: second.response_id || null, http_status: second.status, requested_service_tier: serviceTier, service_tier_evidence: codexLbServiceTierEvidence(first, second) }, { endpoint, home, opts, env }), opts);
  const previousMissing = isPreviousResponseNotFound(second.error_payload || second.json || second.text);
  return recordCodexLbChainHealth(await writeCodexLbChainCache({
    ok: false,
    status: previousMissing ? 'previous_response_not_found' : 'second_request_failed',
    chain_unhealthy: true,
    endpoint,
    response_id: first.response_id,
    http_status: second.status,
    requested_service_tier: serviceTier,
    service_tier_evidence: codexLbServiceTierEvidence(first, second),
    error: redactSecretText(second.error_payload?.error?.message || second.error_payload?.response?.error?.message || second.text || 'codex-lb chained Responses request failed', [apiKey])
  }, { endpoint, home, opts, env }), opts);
}

async function recordCodexLbChainHealth(result: any, opts: any = {}) {
  if (!result || result.skipped || opts.recordCircuit === false) return result;
  await recordCodexLbHealthEvent(opts.root || packageRoot(), result).catch(() => null);
  return result;
}

function hasTopLevelCodexLbSelected(text: any = '') {
  const topLevel = String(text || '').split(/\n\s*\[/)[0] || '';
  return /(^|\n)\s*model_provider\s*=\s*"codex-lb"\s*(?:#.*)?(?=\n|$)/.test(topLevel);
}

function codexLbProviderBaseUrl(text: any = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return block.match(/(^|\n)\s*base_url\s*=\s*"([^"]+)"/)?.[2] || '';
}

function codexLbProviderName(text: any = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return (block.match(/(^|\n)\s*name\s*=\s*"([^"]+)"/)?.[2] || '').trim();
}

function codexLbProviderWireApi(text: any = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return (block.match(/(^|\n)\s*wire_api\s*=\s*"([^"]+)"/)?.[2] || '').trim();
}

function codexLbProviderSupportsWebsockets(text: any = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  if (/(^|\n)\s*supports_websockets\s*=\s*true\s*(?:#.*)?(?=\n|$)/.test(block)) return true;
  if (/(^|\n)\s*supports_websockets\s*=\s*false\s*(?:#.*)?(?=\n|$)/.test(block)) return false;
  return null;
}

function codexLbProviderRequiresOpenAiAuth(text: any = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return /(^|\n)\s*requires_openai_auth\s*=\s*true\s*(?:#.*)?(?=\n|$)/.test(block);
}

function codexLbProviderOpenAiAuthDisabled(text: any = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return /(^|\n)\s*requires_openai_auth\s*=\s*false\s*(?:#.*)?(?=\n|$)/.test(block);
}

function codexLbProviderEnvKey(text: any = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return block.match(/(^|\n)\s*env_key\s*=\s*"([^"]+)"/)?.[2] || '';
}

function codexLbFastModeConfigStatus(text: any = '') {
  const globalServiceTier = topLevelTomlString(text, 'service_tier');
  const profileBlock = String(text || '').match(/(^|\n)\[profiles\.sks-fast-high\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  const profileServiceTier = profileBlock.match(/(^|\n)\s*service_tier\s*=\s*"([^"]+)"/)?.[2] || '';
  const configured = globalServiceTier === 'fast' || globalServiceTier === CODEX_LB_CANONICAL_FAST_SERVICE_TIER || profileServiceTier === 'fast';
  return {
    schema: 'sks.codex-lb-fast-mode-config.v1',
    configured,
    top_level_service_tier: globalServiceTier || null,
    profile_service_tier: profileServiceTier || null,
    codex_request_service_tier: configured ? 'fast' : null,
    codex_lb_upstream_service_tier: configured ? CODEX_LB_CANONICAL_FAST_SERVICE_TIER : null,
    actual_service_tier_verified: false,
    verification_command: 'sks codex-lb fast-check --json',
    proof_required: 'codex-lb request log must show requestedServiceTier=priority and actualServiceTier/serviceTier=priority'
  };
}

function topLevelTomlString(text: any = '', key: string) {
  const topLevel = String(text || '').split(/\n\s*\[/)[0] || '';
  return topLevel.match(new RegExp(`(^|\\n)\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]+)"\\s*(?:#.*)?(?=\\n|$)`))?.[2] || '';
}

function tomlTableString(text: any = '', table: string, key: string) {
  const block = String(text || '').match(new RegExp(`(^|\\n)\\[${escapeRegExp(table)}\\]([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|\\s*$)`))?.[2] || '';
  return block.match(new RegExp(`(^|\\n)\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]+)"\\s*(?:#.*)?(?=\\n|$)`))?.[2] || '';
}

export async function repairCodexLbAuth(opts: any = {}): Promise<CodexLbAuthInstallResult> {
  let status = await codexLbStatus(opts);
  let configRepaired = false;
  let legacyAuthMigrated = false;
  let legacyAuthPath = null;
  const currentConfig = await readText(status.config_path, '');
  if (!status.env_key_configured && status.base_url && (status.provider_configured || status.selected || status.env_base_url_configured)) {
    const legacyAuth = await restoreCodexLbEnvFromSharedLogin(status, opts);
    if (legacyAuth.ok) {
      legacyAuthMigrated = true;
      legacyAuthPath = legacyAuth.auth_path;
      status = await codexLbStatus(opts);
    }
  }
  if (status.env_key_configured && status.base_url && (!status.provider_contract_ok || !status.selected || legacyAuthMigrated || hasTopLevelCodexModeLock(currentConfig) || (opts.forceCodexLbApiKeyAuth === true && !status.ok))) {
    await ensureDir(path.dirname(status.config_path));
    const preservedUserFastMode = extractTomlTable(currentConfig, 'user.fast_mode');
    let next = upsertCodexLbConfig(currentConfig, status.base_url);
    if (preservedUserFastMode) next = upsertTomlTable(next, 'user.fast_mode', preservedUserFastMode);
    next = normalizeCodexFastModeUiConfig(next, {
      forceFastMode: opts.forceFastMode === true || opts.forceCodexLbApiKeyAuth === true
    });
    const safeWrite = await safeWriteCodexConfigToml(status.config_path, currentConfig, next, 'codex-lb-repair');
    configRepaired = safeWrite.ok && safeWrite.changed === true;
    status = await codexLbStatus(opts);
  }
  const canRepairAuthMode = opts.forceCodexLbApiKeyAuth === true && status.provider_contract_ok && status.env_key_configured && Boolean(status.base_url);
  if (!status.ok && !canRepairAuthMode) {
    return {
      ok: false,
      status: !status.env_key_configured ? 'missing_env_key' : !status.base_url ? 'missing_base_url' : 'not_configured',
      config_path: status.config_path,
      env_path: status.env_path,
      codex_lb: status
    };
  }
  await migrateCodexAuthKeyFormat({ home: opts.home });
  const codexEnvironment = await syncCodexLbProviderEnvironment(status, opts);
  const apiKey = parseCodexLbEnvKey(await readText(status.env_path, ''));
  const forceCodexLbApiKeyAuth = opts.forceCodexLbApiKeyAuth === true || opts.authMode === 'codex-lb';
  const authReconcile = await reconcileCodexLbAuthConflict({ ...opts, status, forceCodexLbApiKeyAuth }).catch((err: any) => ({ status: 'failed', reason: 'exception', error: err.message }));
  const codexLogin = forceCodexLbApiKeyAuth
    ? { ok: ['apikey_forced', 'apikey_auth_active'].includes(authReconcile.status), status: authReconcile.status, ...(authReconcile.reason ? { reason: authReconcile.reason } : {}), error: authReconcile.error || null }
    : await maybeSyncCodexLbSharedLogin(apiKey, { ...opts, home: opts.home || process.env.HOME || os.homedir(), force: true });
  const finalStatus = await codexLbStatus(opts);
  const ok = Boolean(codexEnvironment.ok && codexLogin.ok);
  return {
    ok,
    status: ok ? 'repaired' : (codexEnvironment.status || codexLogin.status),
    config_path: status.config_path,
    env_path: status.env_path,
    base_url: status.base_url,
    config_repaired: configRepaired,
    legacy_auth_migrated: legacyAuthMigrated,
    legacy_auth_path: legacyAuthPath,
    auth_reconcile: authReconcile,
    codex_lb: finalStatus,
    codex_environment: codexEnvironment,
    codex_login: codexLogin
  };
}

export async function ensureCodexLbAuthDuringInstall(opts: any = {}): Promise<CodexLbAuthInstallResult> {
  if (process.env.SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH=1' };
  const status = await codexLbStatus(opts);
  if (!status.selected && !status.provider_configured && !status.env_file) return { status: 'not_configured', codex_lb: status };
  if (status.ok && !status.selected && status.auth_mode === 'chatgpt_oauth') {
    return {
      ok: true,
      status: 'present_unselected',
      reason: 'chatgpt_oauth_active_codex_lb_unselected',
      config_path: status.config_path,
      env_path: status.env_path,
      base_url: status.base_url,
      codex_lb: status
    };
  }
  await migrateCodexAuthKeyFormat({ home: opts.home });
  if (status.ok && (!status.selected || !status.provider_contract_ok)) return repairCodexLbAuth(opts);
  if (!status.ok) {
    if (status.base_url && (status.env_key_configured || status.provider_configured || status.selected || status.env_base_url_configured)) return repairCodexLbAuth(opts);
    return { status: status.env_key_configured ? 'missing_base_url' : 'missing_env_key', codex_lb: status, config_path: status.config_path, env_path: status.env_path };
  }
  const codexEnvironment = await syncCodexLbProviderEnvironment(status, opts);
  const apiKey = parseCodexLbEnvKey(await readText(status.env_path, ''));
  const codexLogin = await maybeSyncCodexLbSharedLogin(apiKey, { ...opts, home: opts.home || process.env.HOME || os.homedir(), force: true });
  const authReconcile = await reconcileCodexLbAuthConflict({ ...opts, status }).catch((err: any) => ({ status: 'failed', reason: 'exception', error: err.message }));
  const finalStatus = await codexLbStatus(opts);
  const ok = Boolean(codexEnvironment.ok && codexLogin.ok);
  return {
    ok,
    status: ok ? 'present' : (codexEnvironment.status || codexLogin.status),
    config_path: status.config_path,
    env_path: status.env_path,
    base_url: status.base_url,
    codex_lb: finalStatus,
    codex_environment: codexEnvironment,
    codex_login: codexLogin,
    auth_reconcile: authReconcile,
    error: codexEnvironment.error || codexLogin.error || null
  };
}

async function restoreCodexLbEnvFromSharedLogin(status: any = {}, opts: any = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const authPath = opts.authPath || codexAuthPath(home);
  const envPath = opts.envPath || status.env_path || codexLbEnvPath(home);
  const authText = await readText(authPath, '');
  const apiKey = parseCodexSharedLoginApiKey(authText);
  if (!apiKey) return { ok: false, status: 'missing_legacy_login_key', auth_path: authPath, env_path: envPath };
  const baseUrl = status.base_url || parseCodexLbEnvBaseUrl(await readText(envPath, ''));
  if (!baseUrl) return { ok: false, status: 'missing_base_url', auth_path: authPath, env_path: envPath };
  await ensureDir(path.dirname(envPath));
  await writeTextAtomic(envPath, `export CODEX_LB_BASE_URL=${shellSingleQuote(normalizeCodexLbBaseUrl(baseUrl))}\nexport CODEX_LB_API_KEY=${shellSingleQuote(apiKey)}\n`);
  await fsp.chmod(envPath, 0o600).catch(() => {});
  return { ok: true, status: 'migrated_login_cache', auth_path: authPath, env_path: envPath, base_url: normalizeCodexLbBaseUrl(baseUrl) };
}

// Detects a real ChatGPT OAuth token blob in auth.json.
// A bare {"auth_mode":"browser"} marker is NOT considered an OAuth token blob — we preserve it.
function hasChatgptOAuthTokens(text: any = '') {
  try {
    const parsed = JSON.parse(String(text || ''));
    if (!parsed || typeof parsed !== 'object') return false;
    const authMode = String(parsed.auth_mode || parsed.authMode || parsed.mode || '').toLowerCase();
    const tokens = parsed.tokens || parsed.oauth || parsed.oauth_tokens;
    if (tokens && typeof tokens === 'object') {
      if (tokens.id_token || tokens.access_token || tokens.refresh_token) return true;
    }
    if (authMode && /chatgpt|oauth|browser/.test(authMode)) {
      // Only treat as an OAuth blob when real tokens or a refresh metadata trail are also present.
      if (parsed.last_refresh || parsed.expires_at || parsed.refresh_token || parsed.access_token || parsed.id_token) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function parseCodexAuthApiKey(text: any = '') {
  try {
    const parsed = JSON.parse(String(text || ''));
    const key = parsed?.key || parsed?.api_key || parsed?.apiKey || parsed?.openai_api_key || parsed?.OPENAI_API_KEY;
    return typeof key === 'string' ? key.trim() : '';
  } catch {
    return '';
  }
}

function codexAuthModeSummary(text: any = '') {
  const raw = String(text || '').trim();
  if (!raw) return { mode: 'missing', codex_app_usable: false, summary: 'missing auth.json' };
  if (hasChatgptOAuthTokens(raw)) return { mode: 'chatgpt_oauth', codex_app_usable: true, summary: 'ChatGPT OAuth token blob present' };
  const apiKey = parseCodexAuthApiKey(raw);
  if (apiKey) return { mode: 'apikey', codex_app_usable: true, summary: 'API-key auth.json available for requires_openai_auth providers' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.auth_mode === 'browser') return { mode: 'browser_marker', codex_app_usable: true, summary: 'browser auth marker present; token storage is not inspectable' };
  } catch {}
  return { mode: 'unknown', codex_app_usable: false, summary: 'unrecognized auth.json shape' };
}

// Migrate auth.json from legacy {"auth_mode":"apikey","key":"..."} to the codex 0.130.0+
// format {"auth_mode":"apikey","OPENAI_API_KEY":"..."}. Safe: preserves key value, only renames field.
async function migrateCodexAuthKeyFormat(opts: any = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const authPath = opts.authPath || codexAuthPath(home);
  const text = await readText(authPath, '');
  if (!text.trim()) return { status: 'skipped', reason: 'empty' };
  try {
    const parsed = JSON.parse(text);
    if (parsed?.auth_mode !== 'apikey') return { status: 'skipped', reason: 'not_apikey' };
    if (parsed.OPENAI_API_KEY) return { status: 'skipped', reason: 'already_migrated' };
    const legacyKey = parsed.key || parsed.api_key || parsed.apiKey || parsed.openai_api_key;
    if (!legacyKey) return { status: 'skipped', reason: 'no_key_found' };
    const replacement = `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: legacyKey })}\n`;
    await writeTextAtomic(authPath, replacement);
    await fsp.chmod(authPath, 0o600).catch(() => {});
    return { status: 'migrated', auth_path: authPath };
  } catch {
    return { status: 'skipped', reason: 'parse_error' };
  }
}

// codex-lb's current Codex App contract uses a custom provider named "openai"
// with requires_openai_auth=true. CODEX_LB_API_KEY remains SKS's persisted key
// source, but selecting codex-lb auth must also switch Codex's OpenAI-style
// auth.json to that API key; otherwise the App can appear configured while still
// running under a different ChatGPT/OAuth auth path.
export async function reconcileCodexLbAuthConflict(opts: any = {}): Promise<CodexLbAuthReconcileResult> {
  const home = opts.home || process.env.HOME || os.homedir();
  const status = opts.status || await codexLbStatus({ ...opts, home });
  const authPath = opts.authPath || codexAuthPath(home);
  const backupPath = opts.backupPath || codexAuthChatgptBackupPath(home);
  if (!status.env_key_configured || !status.base_url) {
    return { status: 'skipped', reason: 'codex_lb_not_ready', auth_path: authPath };
  }
  const authExists = await exists(authPath);
  const authText = authExists ? await readText(authPath, '') : '';
  const envText = await readText(status.env_path, '');
  const apiKey = parseCodexLbEnvKey(envText);
  if (!apiKey) {
    return { status: 'skipped', reason: 'missing_env_key', auth_path: authPath };
  }
  const forceCodexLbApiKeyAuth = opts.forceCodexLbApiKeyAuth === true;
  const writeApiKeyAuth = async (reason: string, backupPathForResult: string | null = null) => {
    try {
      await writeTextAtomic(authPath, `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: apiKey }, null, 2)}\n`);
      await fsp.chmod(authPath, 0o600).catch(() => {});
      return {
        status: 'apikey_forced',
        reason,
        auth_path: authPath,
        backup_path: backupPathForResult || backupPath
      };
    } catch (err: any) {
      return { status: 'failed', reason: 'write_failed', auth_path: authPath, backup_path: backupPathForResult || backupPath, error: err.message };
    }
  };
  if (!authExists) {
    if (forceCodexLbApiKeyAuth) return writeApiKeyAuth('codex_lb_auth_selected_missing_auth');
    return { status: 'skipped', reason: 'auth_missing', auth_path: authPath };
  }
  if (!authText.trim()) {
    if (forceCodexLbApiKeyAuth) return writeApiKeyAuth('codex_lb_auth_selected_empty_auth');
    return { status: 'skipped', reason: 'auth_empty', auth_path: authPath };
  }
  if (hasChatgptOAuthTokens(authText)) {
    try {
      await ensureDir(path.dirname(backupPath));
      await writeTextAtomic(backupPath, authText);
      await fsp.chmod(backupPath, 0o600).catch(() => {});
    } catch (err: any) {
      return { status: 'failed', reason: 'backup_failed', auth_path: authPath, backup_path: backupPath, error: err.message };
    }
    if (process.env.SKS_CODEX_LB_NO_AUTH_RECONCILE === '1' && !opts.force) {
      return {
        status: 'backup_only',
        reason: 'SKS_CODEX_LB_NO_AUTH_RECONCILE=1',
        auth_path: authPath,
        backup_path: backupPath
      };
    }
    if (forceCodexLbApiKeyAuth) return writeApiKeyAuth('codex_lb_auth_selected', backupPath);
    if (process.env.SKS_CODEX_LB_FORCE_APIKEY_AUTH !== '1') {
      return {
        status: 'oauth_preserved',
        reason: 'chatgpt_oauth_preserved_until_use_codex_lb_auth',
        auth_path: authPath,
        backup_path: backupPath
      };
    }
    try {
      const replacement = `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: apiKey }, null, 2)}\n`;
      await writeTextAtomic(authPath, replacement);
      await fsp.chmod(authPath, 0o600).catch(() => {});
    } catch (err: any) {
      return { status: 'failed', reason: 'write_failed', auth_path: authPath, backup_path: backupPath, error: err.message };
    }
    return {
      status: 'apikey_forced',
      reason: 'SKS_CODEX_LB_FORCE_APIKEY_AUTH=1',
      auth_path: authPath,
      backup_path: backupPath
    };
  }

  const currentApiKey = parseCodexAuthApiKey(authText);
  if (forceCodexLbApiKeyAuth) {
    if (currentApiKey && currentApiKey === apiKey) {
      return {
        status: 'apikey_auth_active',
        reason: 'codex_lb_auth_selected',
        auth_path: authPath,
        backup_path: backupPath
      };
    }
    return writeApiKeyAuth('codex_lb_auth_selected_replace_existing');
  }
  if (currentApiKey && currentApiKey === apiKey) {
    const backupText = await readText(backupPath, '');
    if (hasChatgptOAuthTokens(backupText) && process.env.SKS_CODEX_LB_KEEP_APIKEY_AUTH !== '1') {
      try {
        const restored = backupText.endsWith('\n') ? backupText : `${backupText}\n`;
        await writeTextAtomic(authPath, restored);
        await fsp.chmod(authPath, 0o600).catch(() => {});
        return {
          status: 'oauth_restored',
          reason: 'restored_chatgpt_oauth_for_codex_app',
          auth_path: authPath,
          backup_path: backupPath
        };
      } catch (err: any) {
        return { status: 'failed', reason: 'restore_failed', auth_path: authPath, backup_path: backupPath, error: err.message };
      }
    }
    return {
      status: 'apikey_auth_active',
      reason: hasChatgptOAuthTokens(backupText) ? 'SKS_CODEX_LB_KEEP_APIKEY_AUTH=1' : 'chatgpt_oauth_backup_missing',
      auth_path: authPath,
      backup_path: backupPath
    };
  }

  return { status: 'no_oauth_conflict', auth_path: authPath };
}

// Expose the ChatGPT OAuth backup path so the CLI can surface it in status / release output.
export function codexLbChatgptBackupPath(home: any = process.env.HOME || os.homedir()) {
  return codexAuthChatgptBackupPath(home);
}

// Remove a top-level TOML key (only above the first table header). Returns the original text
// unchanged when the key isn't present.
function removeTopLevelTomlString(text: any, key: any) {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  let removed = false;
  for (let i = end - 1; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(line)) {
      lines.splice(i, 1);
      removed = true;
    }
  }
  if (!removed) return text;
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

// Unselect codex-lb at the top-level model_provider setting. Leaves [model_providers.codex-lb]
// and the env file alone so the user can re-engage with `sks codex-lb repair`.
export async function unselectCodexLbProvider(opts: any = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  const current = await readText(configPath, '');
  if (!current.trim()) return { status: 'not_selected', reason: 'no_config', config_path: configPath };
  if (!hasTopLevelCodexLbSelected(current)) return { status: 'not_selected', config_path: configPath };
  try {
    const next = ensureTrailingNewline(removeTopLevelTomlString(current, 'model_provider'));
    const safeWrite = await safeWriteCodexConfigToml(configPath, current, next, 'codex-lb-unselect');
    return { status: safeWrite.ok ? 'unselected' : safeWrite.status, config_path: configPath, backup_path: safeWrite.backup_path };
  } catch (err: any) {
    return { status: 'failed', reason: 'write_failed', config_path: configPath, error: err.message };
  }
}

// Reverse of reconcileCodexLbAuthConflict: restore the ChatGPT OAuth blob from the backup file
// so the user can return to the official ChatGPT account login. Also deselects codex-lb at the
// model_provider level by default so the restored OAuth blob actually wins; pass keepProvider
// to skip that.
//
// Options:
//   home          - HOME override (selftest)
//   keepProvider  - leave `model_provider = "codex-lb"` selected (default: deselect)
//   deleteBackup  - remove ~/.codex/auth.chatgpt-backup.json after a successful restore
//                   (default: false; keeping it makes the next reconcile cycle a no-op clobber risk)
//   force         - restore even if the current auth.json shape isn't recognized
export async function releaseCodexLbAuthHold(opts: any = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const authPath = opts.authPath || codexAuthPath(home);
  const backupPath = opts.backupPath || codexAuthChatgptBackupPath(home);
  const configPath = opts.configPath || codexLbConfigPath(home);

  const backupExists = await exists(backupPath);
  const backupText = backupExists ? await readText(backupPath, '') : '';
  if (!backupExists || !backupText.trim()) {
    return {
      status: 'no_backup',
      auth_path: authPath,
      backup_path: backupPath,
      provider_unselected: false
    };
  }
  if (!hasChatgptOAuthTokens(backupText)) {
    return {
      status: 'no_backup',
      reason: 'backup_not_oauth',
      auth_path: authPath,
      backup_path: backupPath,
      provider_unselected: false
    };
  }

  const currentAuthText = await readText(authPath, '');
  const trimmedCurrent = currentAuthText.trim();

  // If auth.json already looks like ChatGPT OAuth (user re-logged in some other way), don't
  // clobber it — but still honor the deselect request so the OAuth blob takes effect.
  if (trimmedCurrent && hasChatgptOAuthTokens(currentAuthText) && !opts.force) {
    let providerUnselected = false;
    let providerError = null;
    if (!opts.keepProvider) {
      const unselected = await unselectCodexLbProvider({ ...opts, home, configPath });
      if (unselected.status === 'unselected') providerUnselected = true;
      else if (unselected.status === 'failed') providerError = unselected.error || unselected.reason || 'unselect_failed';
    }
    return {
      status: 'already_chatgpt',
      auth_path: authPath,
      backup_path: backupPath,
      provider_unselected: providerUnselected,
      provider_error: providerError
    };
  }

  // Refuse to clobber unfamiliar auth.json shapes unless forced. We expect either an empty file,
  // the apikey shape we wrote during reconcile, or a stray `{"auth_mode":"browser"}` marker.
  if (!opts.force && trimmedCurrent) {
    const looksApikey = /"auth_mode"\s*:\s*"apikey"/.test(currentAuthText) && Boolean(parseCodexAuthApiKey(currentAuthText));
    const looksBrowserMarker = /^\{\s*"auth_mode"\s*:\s*"browser"\s*\}\s*$/.test(currentAuthText);
    if (!looksApikey && !looksBrowserMarker) {
      return {
        status: 'auth_in_use',
        reason: 'unfamiliar_auth_json',
        auth_path: authPath,
        backup_path: backupPath,
        provider_unselected: false
      };
    }
  }

  try {
    await ensureDir(path.dirname(authPath));
    const restored = backupText.endsWith('\n') ? backupText : `${backupText}\n`;
    await writeTextAtomic(authPath, restored);
    await fsp.chmod(authPath, 0o600).catch(() => {});
  } catch (err: any) {
    return {
      status: 'failed',
      reason: 'restore_failed',
      auth_path: authPath,
      backup_path: backupPath,
      error: err.message,
      provider_unselected: false
    };
  }

  let backupRemoved = false;
  if (opts.deleteBackup) {
    try {
      await fsp.rm(backupPath, { force: true });
      backupRemoved = true;
    } catch {
      // Non-fatal: the restore already landed.
    }
  }

  let providerUnselected = false;
  let providerError = null;
  if (!opts.keepProvider) {
    const unselected = await unselectCodexLbProvider({ ...opts, home, configPath });
    if (unselected.status === 'unselected') providerUnselected = true;
    else if (unselected.status === 'failed') providerError = unselected.error || unselected.reason || 'unselect_failed';
  }

  return {
    status: 'released',
    auth_path: authPath,
    backup_path: backupPath,
    backup_removed: backupRemoved,
    provider_unselected: providerUnselected,
    provider_error: providerError
  };
}

export async function maybePromptCodexLbSetupForLaunch(args: any = [], opts: any = {}) {
  if (args.includes('--json') || args.includes('--skip-codex-lb') || process.env.SKS_SKIP_CODEX_LB_PROMPT === '1') return { status: 'skipped' };
  let status = await codexLbStatus(opts);
  if (status.env_key_configured && status.base_url && !status.selected && status.auth_mode === 'chatgpt_oauth') {
    return { status: 'continued_to_codex', ok: false, chain_health: null, codex_lb: status, reason: 'chatgpt_oauth_active_codex_lb_unselected' };
  }
  if (status.env_key_configured && status.base_url && (!status.provider_configured || !status.selected || !status.provider_contract_ok)) {
    let promptedRestore = false;
    if (!status.provider_configured && canAskYesNo()) {
      promptedRestore = true;
      const restore = (await askPostinstallQuestion('\ncodex-lb provider section is missing, but stored auth exists. Restore and route Codex through codex-lb? [Y/n] ')).trim();
      if (/^(n|no|아니|아니요|ㄴ)$/i.test(restore)) return { status: 'continued_to_codex', codex_lb: status };
    }
    const repaired = await repairCodexLbAuth(opts);
    status = await codexLbStatus(opts);
    if (!status.ok) return { status: 'repair_failed', ok: false, repair: repaired, codex_lb: status };
    if (!repaired.ok && repaired.error && promptedRestore) console.log(`codex-lb provider restored, but launch environment sync reported: ${repaired.error}`);
    else if (!repaired.ok && promptedRestore) console.log(`codex-lb provider restored, but provider auth sync reported: ${repaired.status}`);
    else if (repaired.config_repaired && promptedRestore) console.log(`codex-lb provider restored: ${status.base_url}`);
  }
  if (status.ok) {
    const codexEnvironment = await syncCodexLbProviderEnvironment(status, opts);
    if (codexEnvironment.status === 'synced') console.log('codex-lb provider auth synced for this user session.');
    const apiKey = parseCodexLbEnvKey(await readText(status.env_path, ''));
    const codexLogin = await maybeSyncCodexLbSharedLogin(apiKey, { ...opts, home: opts.home || process.env.HOME || os.homedir() });
    if (codexLogin.status === 'synced') console.log('codex-lb auth synced with Codex CLI login cache.');
    const chainHealth = await checkCodexLbResponseChain(status, opts);
    if (!chainHealth.ok && chainHealth.chain_unhealthy) {
      // `previous_response_not_found` is normal for stateless LB deployments that don't persist
      // Responses across requests. The codex-lb provider still works fine — only the chained
      // health probe fails. Keep codex-lb active and just warn.
      if (chainHealth.status === 'previous_response_not_found') {
        console.log('codex-lb response chain check: previous_response_id not persisted by the load balancer (this is normal for stateless deployments). Keeping codex-lb active.');
        return { status: 'present', ...status, codex_environment: codexEnvironment, codex_login: codexLogin, chain_health: chainHealth };
      }
      // Hard chain failure (auth rejected, timeout, missing base URL, etc.). Don't silently
      // demote a configured codex-lb to ChatGPT OAuth — surface the failure and let the user
      // decide. Default keeps codex-lb (just press Enter).
      console.log(`codex-lb response chain check failed (${chainHealth.status}${chainHealth.error ? `: ${chainHealth.error}` : ''}).`);
      if (process.env.SKS_CODEX_LB_AUTOBYPASS === '1') {
        console.log('SKS_CODEX_LB_AUTOBYPASS=1 set; bypassing codex-lb to ChatGPT OAuth for this launch.');
        return { status: 'chain_unhealthy', ...status, ok: false, codex_environment: codexEnvironment, codex_login: codexLogin, chain_health: chainHealth, bypass_codex_lb: true };
      }
      if (canAskYesNo()) {
        const answer = (await askPostinstallQuestion('Use codex-lb anyway, or fall back to ChatGPT OAuth? [LB/oauth] ')).trim().toLowerCase();
        if (/^(oauth|o|chatgpt|fall ?back|n|no|아니|아니요|ㄴ)$/.test(answer)) {
          console.log('Falling back to ChatGPT OAuth for this launch. Re-enable codex-lb anytime with `sks codex-lb repair`.');
          return { status: 'chain_unhealthy', ...status, ok: false, codex_environment: codexEnvironment, codex_login: codexLogin, chain_health: chainHealth, bypass_codex_lb: true };
        }
        console.log('Keeping codex-lb active. To switch back to ChatGPT OAuth: `sks codex-lb release`.');
        return { status: 'present', ...status, codex_environment: codexEnvironment, codex_login: codexLogin, chain_health: chainHealth };
      }
      // Non-interactive context with no opt-out env var. The user explicitly configured codex-lb,
      // so default to keeping it active rather than silently swapping providers.
      console.log('Non-interactive launch + chain check failure. Keeping codex-lb active. Set SKS_CODEX_LB_AUTOBYPASS=1 to auto-bypass to ChatGPT OAuth.');
      return { status: 'present', ...status, codex_environment: codexEnvironment, codex_login: codexLogin, chain_health: chainHealth };
    }
    return { status: 'present', ...status, codex_environment: codexEnvironment, codex_login: codexLogin, chain_health: chainHealth };
  }
  if (!canAskYesNo()) return { status: 'non_interactive', codex_lb: status };
  const useCodexLb = (await askPostinstallQuestion('\ncodex-lb is not configured for this Codex App profile. Configure and route Codex through codex-lb now? [y/N] ')).trim();
  if (!/^(y|yes|예|네|응)$/i.test(useCodexLb)) return { status: 'continued_to_codex' };
  const host = (await askPostinstallQuestion('codex-lb host domain [http://127.0.0.1:2455]: ')).trim() || 'http://127.0.0.1:2455';
  const apiKey = (await askPostinstallQuestion('codex-lb API key: ')).trim();
  const configured = await configureCodexLb({ ...opts, host, apiKey });
  if (configured.ok) console.log(`codex-lb configured: ${configured.base_url}`);
  else console.log('codex-lb setup skipped: API key was empty.');
  return configured;
}

async function syncCodexLbProviderEnvironment(status: any = {}, opts: any = {}): Promise<CodexLbEnvSyncResult> {
  const home = opts.home || process.env.HOME || os.homedir();
  const envPath = opts.envPath || status.env_path || codexLbEnvPath(home);
  const envText = await readText(envPath, '');
  const apiKey = String(opts.apiKey || '').trim() || parseCodexLbEnvKey(envText);
  if (!apiKey) return { ok: false, status: 'missing_env_key' };
  const baseUrl = status.base_url || opts.baseUrl || parseCodexLbEnvBaseUrl(envText);
  process.env.CODEX_LB_API_KEY = apiKey;
  if (baseUrl) process.env.CODEX_LB_BASE_URL = baseUrl;
  const launchEnv = await syncCodexLbMacLaunchEnvironment(baseUrl ? { CODEX_LB_BASE_URL: baseUrl } : {}, opts);
  const ok = launchEnv.ok || launchEnv.skipped || launchEnv.status === 'not_macos';
  return {
    ok,
    status: launchEnv.status === 'synced' ? 'launch_base_url_synced_secret_env_removed' : ok ? 'process_env' : launchEnv.status,
    env_path: envPath,
    base_url: baseUrl || null,
    launch_environment: launchEnv,
    error: launchEnv.error || null
  };
}

async function syncCodexLbMacLaunchEnvironment(values: any = {}, opts: any = {}) {
  if (opts.syncLaunchEnv === false || process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV === '1') return { ok: true, status: 'skipped', skipped: true, reason: 'SKS_SKIP_CODEX_LB_LAUNCH_ENV=1' };
  if (process.platform !== 'darwin' && !opts.forceLaunchEnv) return { ok: true, status: 'not_macos', skipped: true };
  const launchctl = opts.launchctlBin || await which('launchctl').catch(() => null) || await exists('/bin/launchctl').then((ok: any) => ok ? '/bin/launchctl' : null).catch(() => null);
  if (!launchctl) return { ok: false, status: 'launchctl_missing', error: 'launchctl not found on PATH' };
  const secretCleanup = await cleanupMacLaunchSecretEnvironment({ force: opts.forceLaunchEnv === true }).catch((err: any) => ({
    ok: false,
    status: 'partial',
    variables: ['CODEX_LB_API_KEY', 'OPENROUTER_API_KEY'],
    cleaned: [],
    failed: [{ key: 'CODEX_LB_API_KEY', error: err?.message || String(err) }, { key: 'OPENROUTER_API_KEY', error: err?.message || String(err) }],
    next_actions: ['Run launchctl unsetenv for CODEX_LB_API_KEY and OPENROUTER_API_KEY']
  }));
  const variables = Object.entries(values).filter(([key, value]: any) => value && !['CODEX_LB_API_KEY', 'OPENROUTER_API_KEY'].includes(String(key)));
  const results: any[] = [];
  for (const [key, value] of variables) {
    const result = await runProcess(launchctl, ['setenv', key, String(value)], { timeoutMs: 5000, maxOutputBytes: 8192 });
    results.push({
      key,
      ok: result.code === 0,
      error: result.code === 0 ? null : redactSecretText(result.stderr || result.stdout || 'launchctl setenv failed', [value]).trim()
    });
  }
  const failed = results.filter((result: any) => !result.ok);
  if (failed.length) return { ok: false, status: 'launch_env_failed', variables: results.map((result: any) => result.key), failed, secret_env_cleanup: secretCleanup, error: failed.map((result: any) => `${result.key}: ${result.error}`).join('; ') };
  return {
    ok: secretCleanup.ok !== false,
    status: variables.length ? 'synced' : 'secret_env_removed',
    variables: results.map((result: any) => result.key),
    skipped_secret_variables: ['CODEX_LB_API_KEY', 'OPENROUTER_API_KEY'],
    secret_env_cleanup: secretCleanup
  };
}

async function inspectCodexLbMacLaunchEnvironment(baseUrl: any = '', opts: any = {}) {
  if (process.platform !== 'darwin' && !opts.forceLaunchEnv) return { checked: false, status: 'not_macos', skipped: true };
  const launchctl = opts.launchctlBin || await which('launchctl').catch(() => null) || await exists('/bin/launchctl').then((ok: any) => ok ? '/bin/launchctl' : null).catch(() => null);
  if (!launchctl) return { checked: true, available: false, status: 'launchctl_missing' };
  const readVar = async (key: string) => {
    const result = await runProcess(launchctl, ['getenv', key], { timeoutMs: 3000, maxOutputBytes: 8192 });
    return result.code === 0 ? String(result.stdout || '').trim() : '';
  };
  const currentBaseUrl = await readVar('CODEX_LB_BASE_URL');
  const currentApiKey = await readVar('CODEX_LB_API_KEY');
  const currentOpenRouterKey = await readVar('OPENROUTER_API_KEY');
  const baseMatches = !baseUrl || currentBaseUrl === String(baseUrl || '').trim();
  const basePresent = Boolean(currentBaseUrl);
  const keyPresent = Boolean(currentApiKey);
  const openRouterKeyPresent = Boolean(currentOpenRouterKey);
  return {
    checked: true,
    available: true,
    status: keyPresent || openRouterKeyPresent
      ? 'secret_env_present'
      : basePresent && baseMatches
        ? 'base_url_only'
        : basePresent
          ? 'partial'
          : 'missing',
    variables: [
      ...(keyPresent ? ['CODEX_LB_API_KEY'] : []),
      ...(openRouterKeyPresent ? ['OPENROUTER_API_KEY'] : []),
      ...(basePresent ? ['CODEX_LB_BASE_URL'] : [])
    ],
    base_url_present: basePresent,
    base_url_matches: baseMatches,
    api_key_present: keyPresent,
    openrouter_api_key_present: openRouterKeyPresent,
    next_actions: keyPresent || openRouterKeyPresent
      ? ['Run: sks doctor --fix', 'Rotate CODEX_LB_API_KEY and OPENROUTER_API_KEY if they were exposed in launchd.']
      : []
  };
}

async function maybeSyncCodexLbSharedLogin(apiKey: any, opts: any = {}): Promise<CodexLbLoginSyncResult> {
  if (!apiKey) return { ok: false, status: 'missing_env_key' };
  if (!shouldSyncCodexLbSharedLogin(opts)) {
    return { ok: true, status: 'skipped', reason: 'codex-lb repair preserved the current Codex App auth; run `sks codex-lb use-codex-lb` to switch the app to codex-lb API-key auth.' };
  }
  return syncCodexApiKeyLogin(apiKey, opts);
}

function shouldSyncCodexLbSharedLogin(opts: any = {}) {
  return opts.syncCodexLogin === true || process.env.SKS_CODEX_LB_SYNC_CODEX_LOGIN === '1';
}

async function syncCodexApiKeyLogin(apiKey: any, opts: any = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const codexHome = opts.codexHome || path.join(home, '.codex');
  const codexBin = opts.codexBin || (await getCodexInfo().catch(() => EMPTY_CODEX_INFO)).bin || await which('codex').catch(() => null);
  if (!codexBin) return { ok: false, status: 'codex_missing' };
  await ensureDir(codexHome);
  const env = { HOME: home, CODEX_HOME: codexHome, CODEX_LB_API_KEY: apiKey };
  if (!opts.force) {
    const current = await runProcess(codexBin, ['login', 'status'], { env, timeoutMs: 10000, maxOutputBytes: 8192 });
    if (current.code === 0 && !/not logged in/i.test(`${current.stdout}\n${current.stderr}`)) return { ok: true, status: 'present' };
  }
  const login = await runProcess(codexBin, ['login', '--with-api-key'], { input: `${apiKey}\n`, env, timeoutMs: 15000, maxOutputBytes: 8192 });
  if (login.code === 0) return { ok: true, status: 'synced' };
  return { ok: false, status: 'login_failed', error: redactSecretText(login.stderr || login.stdout || 'codex login failed', [apiKey]).trim() };
}

export function upsertCodexLbConfig(text: any = '', baseUrl: any, selectDefault = true) {
  let next = selectDefault
    ? upsertTopLevelTomlString(text, 'model_provider', 'codex-lb')
    : removeTopLevelTomlKeyIfValue(text, 'model_provider', 'codex-lb');
  const block = [
    '[model_providers.codex-lb]',
    'name = "openai"',
    `base_url = "${baseUrl}"`,
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true'
  ].join('\n');
  next = upsertTomlTable(next, 'model_providers.codex-lb', block);
  return `${next.trim()}\n`;
}

export function upsertCodexAppGlmConfig(text: any = '') {
  let next = String(text || '');
  const providerBlock = [
    `[model_providers.${GLM_CODEX_CONFIG_PROVIDER_ID}]`,
    'name = "OpenRouter"',
    'base_url = "https://openrouter.ai/api/v1"',
    'wire_api = "responses"',
    'env_key = "OPENROUTER_API_KEY"',
    'requires_openai_auth = false'
  ].join('\n');
  next = upsertTomlTable(next, `model_providers.${GLM_CODEX_CONFIG_PROVIDER_ID}`, providerBlock);
  for (const profile of GLM_CODEX_CONFIG_REASONING_PROFILES) {
    const profileBlock = [
      `[profiles.${profile.id}]`,
      `model_provider = "${GLM_CODEX_CONFIG_PROVIDER_ID}"`,
      `model = "${GLM_52_OPENROUTER_MODEL}"`,
      `model_reasoning_effort = "${profile.reasoning_effort}"`,
      'service_tier = "default"',
      'approval_policy = "on-request"'
    ].join('\n');
    next = upsertTomlTable(next, `profiles.${profile.id}`, profileBlock);
  }
  return `${next.trim()}\n`;
}

export async function ensureGlobalCodexAppGlmProfile(opts: any = {}) {
  if (process.env.SKS_SKIP_CODEX_GLM_PROFILE_REPAIR === '1' && opts.force !== true) {
    return { ok: true, status: 'skipped', reason: 'SKS_SKIP_CODEX_GLM_PROFILE_REPAIR=1' };
  }
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  try {
    await ensureDir(path.dirname(configPath));
    const current = await readText(configPath, '');
    const next = upsertCodexAppGlmConfig(current);
    const safeWrite = await safeWriteCodexConfigToml(configPath, current, next, 'glm-profile');
    return {
      ...safeWrite,
      status: safeWrite.status === 'written' ? 'updated' : safeWrite.status,
      provider: GLM_CODEX_CONFIG_PROVIDER_ID,
      model: GLM_52_OPENROUTER_MODEL,
      codex_config_profile: GLM_CODEX_CONFIG_PROFILE_ID,
      reasoning_profiles: GLM_CODEX_CONFIG_REASONING_PROFILES.map((profile) => profile.id)
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'failed',
      config_path: configPath,
      error: err.message,
      provider: GLM_CODEX_CONFIG_PROVIDER_ID,
      model: GLM_52_OPENROUTER_MODEL,
      codex_config_profile: GLM_CODEX_CONFIG_PROFILE_ID,
      reasoning_profiles: GLM_CODEX_CONFIG_REASONING_PROFILES.map((profile) => profile.id)
    };
  }
}

function detectCodexLbSetupDrift(state: any = {}): string[] {
  const drift: string[] = [];
  if (state.useDefaultProvider && state.selected !== true) drift.push('default_provider_not_selected');
  if (!state.useDefaultProvider && state.selected === true) drift.push('default_provider_selected_despite_no_default_provider');
  if (state.writeEnvFile && state.envFile !== true) drift.push('env_file_not_written');
  if (!state.writeEnvFile && state.beforeState && state.afterState && state.beforeState.envHash !== state.afterState.envHash) drift.push('env_file_changed_despite_no_env_file');
  if (!state.writeEnvFile && !state.beforeState && state.envFile === true) drift.push('env_file_written_despite_no_env_file');
  if (!state.storeKeychain && state.keychain?.status && state.keychain.status !== 'skipped') drift.push('keychain_touched_despite_no_keychain');
  if (!state.syncLaunchctl && state.codexEnvironment?.launch_environment?.status === 'synced') drift.push('launchctl_base_url_synced_despite_no_launchctl');
  if (state.codexEnvironment?.launch_environment?.secret_env_cleanup?.status === 'partial') drift.push('launchctl_secret_env_cleanup_incomplete');
  if (state.shellProfile === 'skip' && state.shellProfileResult?.status === 'installed') drift.push('shell_profile_written_despite_skip');
  if (state.shellProfile === 'skip' && state.beforeState && state.afterState && state.beforeState.profileHash !== state.afterState.profileHash) drift.push('shell_profile_changed_despite_skip');
  return drift;
}

async function captureCodexLbSetupWriteState({ home, configPath, envPath, shellProfile }: any = {}) {
  const profileFiles = profileFilesForDrift(home, shellProfile);
  return {
    configHash: await fileHashOrMissing(configPath),
    envHash: await fileHashOrMissing(envPath),
    profileHash: (await Promise.all(profileFiles.map((file: string) => fileHashOrMissing(file)))).join('|')
  };
}

async function fileHashOrMissing(file: string) {
  const text = await readText(file, null).catch(() => null);
  return text === null ? 'missing' : await sha256Text(String(text));
}

function profileFilesForDrift(home: string, shellProfile: string) {
  const targets = {
    zsh: path.join(home, '.zshrc'),
    bash: path.join(home, '.bashrc'),
    fish: path.join(home, '.config', 'fish', 'config.fish')
  };
  if (shellProfile === 'zsh') return [targets.zsh];
  if (shellProfile === 'bash') return [targets.bash];
  if (shellProfile === 'fish') return [targets.fish];
  if (shellProfile === 'all') return [targets.zsh, targets.bash, targets.fish];
  return [targets.zsh, targets.bash, targets.fish];
}

function appliedCodexLbPersistenceModes(state: any = {}): CodexLbPersistenceMode[] {
  const modes: CodexLbPersistenceMode[] = [];
  if (state.writeEnvFile && state.envFile === true) modes.push('durable_env_file');
  if (state.storeKeychain && state.keychain?.ok === true) modes.push('durable_keychain');
  if (state.syncLaunchctl && state.codexEnvironment?.launch_environment?.status === 'synced') modes.push('process_only_ephemeral');
  if (state.shellProfile !== 'skip' && state.shellProfileResult?.status === 'installed') modes.push('shell_profile');
  if (!modes.length && state.apiKeySource === 'process.env') modes.push('process_only_ephemeral');
  if (!modes.length) modes.push('none');
  return modes;
}

export async function ensureGlobalCodexFastModeDuringInstall(opts: any = {}) {
  if (process.env.SKS_SKIP_CODEX_FAST_MODE_REPAIR === '1') return { status: 'skipped', reason: 'SKS_SKIP_CODEX_FAST_MODE_REPAIR=1' };
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  try {
    await ensureDir(path.dirname(configPath));
    const current = await readText(configPath, '');
    // Safety gate 1: never blind-overwrite an unparseable user config — that would
    // entrench corruption on the file Codex actually loads. Back it up and bail.
    if (current.trim()) {
      const currentSmoke = codexConfigParseSmoke(current);
      if (!currentSmoke.ok) {
        const backupPath = await backupCodexConfig(configPath, current, 'unparseable');
        return { status: 'unparseable_config_preserved', config_path: configPath, backup_path: backupPath, parse_smoke: currentSmoke };
      }
    }
    const next = normalizeCodexFastModeUiConfig(current, {
      forceFastMode: opts.forceFastMode === true,
      forceFastModeOff: opts.forceFastModeOff === true
    });
    if (next === ensureTrailingNewline(current)) return { status: 'present', config_path: configPath };
    const safeWrite = await safeWriteCodexConfigToml(configPath, current, next, 'codex-fast-mode-install');
    return {
      status: safeWrite.status === 'written' ? 'updated' : safeWrite.status,
      config_path: configPath,
      backup_path: safeWrite.backup_path,
      parse_smoke: safeWrite.ok ? undefined : safeWrite
    };
  } catch (err: any) {
    return { status: 'failed', config_path: configPath, error: err.message };
  }
}

export function normalizeCodexFastModeUiConfig(text: any = '', opts: any = {}) {
  // Run to a fixed point so a second install is a true no-op (idempotent). The per-pass
  // table/whitespace normalization converges within one extra pass.
  return normalizeCodexFastModeUiConfigOnce(normalizeCodexFastModeUiConfigOnce(text, opts), opts);
}

function normalizeCodexFastModeUiConfigOnce(text: any = '', opts: any = {}) {
  // Keep SKS-owned model/reasoning defaults out of top-level config so Codex
  // Desktop can expose its native selectors, but preserve a user's deliberate
  // top-level model/service/reasoning choices across install, update, and doctor.
  let next = String(text || '');
  const misplacedDefaultProfile = tomlTableString(next, 'user.fast_mode', 'default_profile');
  next = removeLegacyTopLevelCodexModeLocks(next);
  next = removeTomlTableKey(next, 'user.fast_mode', 'default_profile');
  next = removeTomlTableKey(next, 'notice', 'fast_default_opt_out');
  next = removeTomlTableKey(next, 'features', 'codex_hooks');
  if (opts.forceFastMode === true) {
    next = upsertTopLevelTomlString(next, 'service_tier', 'fast');
  } else if (opts.forceFastModeOff === true) {
    next = upsertTopLevelTomlString(next, 'service_tier', 'default');
  }
  // Codex App feature flags / fast-mode UI / suppress-warning are SET-IF-ABSENT: a fresh
  // config still gets SKS's defaults, but SKS NEVER overrides (re-enables) a feature the
  // user disabled in the App, and never rejects-then-hides UI by forcing an unrecognized
  // flag on an older App build. This is what stops SKS from "removing/blocking" the App UI.
  next = upsertTopLevelTomlBooleanIfAbsent(next, 'suppress_unstable_features_warning', true);
  for (const featureLine of [
    'hooks = true', 'remote_control = true', 'multi_agent = true', 'fast_mode = true',
    'fast_mode_ui = true', 'codex_git_commit = true', 'computer_use = true', 'browser_use = true',
    'browser_use_external = true', 'image_generation = true', 'in_app_browser = true',
    'guardian_approval = true', 'tool_suggest = true', 'apps = true', 'plugins = true'
  ]) {
    const featureKey = featureLine.split('=')[0]?.trim();
    next = opts.forceFastMode === true && ['fast_mode', 'fast_mode_ui'].includes(String(featureKey || ''))
      ? upsertTomlTableKey(next, 'features', featureLine)
      : upsertTomlTableKeyIfAbsent(next, 'features', featureLine);
  }
  if (opts.forceFastMode === true || opts.forceFastModeOff === true) {
    next = upsertTomlTableKey(next, 'user.fast_mode', 'visible = true');
    next = upsertTomlTableKey(next, 'user.fast_mode', 'enabled = true');
    next = opts.forceFastMode === true
      ? upsertTopLevelTomlString(next, 'default_profile', 'sks-fast-high')
      : removeTopLevelTomlKeyIfValue(next, 'default_profile', 'sks-fast-high');
  } else {
    next = upsertTomlTableKeyIfAbsent(next, 'user.fast_mode', 'visible = true');
    next = upsertTomlTableKeyIfAbsent(next, 'user.fast_mode', 'enabled = true');
    if (misplacedDefaultProfile === 'sks-fast-high') {
      next = upsertTopLevelTomlString(next, 'default_profile', 'sks-fast-high');
    }
  }
  // Keep ONLY the sks-fast-high config-profile table for explicit fast-mode opt-in
  // and CLI `--profile` use. The other SKS config profiles are
  // no longer written as `[profiles.sks-*]` tables here (Codex 0.134+ deprecates them);
  // they are managed as per-file `<name>.config.toml` overlays by
  // migrateSksProfilesToPerFile (src/core/auto-review.ts), which also writes the
  // sks-fast-high overlay for CLI `--profile` use.
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', `model = "${REQUIRED_CODEX_MODEL}"`);
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'service_tier = "fast"');
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'approval_policy = "on-request"');
  // Do not force a sandbox from the Codex App fast profile. The App/IDE
  // permissions selector owns full-access vs workspace-write; this profile only
  // supplies SKS's model, speed, approval, and reasoning defaults.
  next = removeTomlTableKey(next, 'profiles.sks-fast-high', 'sandbox_mode');
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'model_reasoning_effort = "high"');
  // Plugin auto-enable is OPT-IN only. Force-writing `[plugins."name@marketplace"] enabled =
  // true` for marketplace plugins the App may not have installed (different build/channel)
  // makes the App reference plugins it cannot load -> broken/blocked plugin UI. It also
  // replaced the user's whole plugin table, reverting any `enabled = false` they set. By
  // default SKS leaves the user's [plugins] alone; opt in with SKS_MANAGE_CODEX_APP_PLUGINS=1.
  if (process.env.SKS_MANAGE_CODEX_APP_PLUGINS === '1') {
    for (const [name, marketplace] of DEFAULT_CODEX_APP_PLUGINS) {
      const table = `plugins."${name}@${marketplace}"`;
      if (!hasTomlTable(next, table)) next = upsertTomlTable(next, table, `[${table}]\nenabled = true`);
    }
  }
  return ensureTrailingNewline(next);
}

function removeLegacyTopLevelCodexModeLocks(text: any = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  const topLevelModel = topLevelTomlString(text, 'model');
  const removeSksOwnedModeLock = topLevelModel === REQUIRED_CODEX_MODEL;
  return lines.filter((line: any, index: any) => {
    if (index >= end) return true;
    if (!removeSksOwnedModeLock) return true;
    return !/^\s*(?:model|model_reasoning_effort)\s*=/.test(line);
  }).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function removeTopLevelTomlKeyIfValue(text: any = '', key: any = '', value: any = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"${escapeRegExp(value)}"\\s*(?:#.*)?$`);
  return lines.filter((line: any, index: any) => index >= end || !keyPattern.test(line)).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function removeTomlTableKey(text: any, table: any, key: any) {
  const lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') return '';
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) return String(text || '');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const ln = lines[i];
    if (ln === undefined) continue;
    if (/^\s*\[.+\]\s*$/.test(ln)) {
      end = i;
      break;
    }
  }
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  return lines.filter((line: any, index: any) => index <= start || index >= end || !keyPattern.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');
}

function upsertTomlTableKey(text: any, table: any, line: any) {
  const key = String(line).split('=')[0]?.trim() ?? '';
  const lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines.length = 0;
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) return [...lines, ...(lines.length ? [''] : []), header, line].join('\n').replace(/\n{3,}/g, '\n\n');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln === undefined) continue;
    if (/^\s*\[.+\]\s*$/.test(ln)) {
      end = i;
      break;
    }
  }
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  for (let i = start + 1; i < end; i++) {
    const ln = lines[i];
    if (ln === undefined) continue;
    if (keyRe.test(ln)) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  if (hasTomlTableKey(lines.join('\n'), table, key)) return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

// True if [table] already declares `key` (so we never override a user's explicit value).
function hasTomlTableKey(text: any, table: any, key: any) {
  const lines = String(text || '').split('\n');
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) return false;
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  for (let i = start + 1; i < lines.length; i += 1) {
    const ln = lines[i];
    if (ln === undefined) continue;
    if (/^\s*\[.+\]\s*$/.test(ln)) break;
    if (keyRe.test(ln)) return true;
  }
  return false;
}

// Set a [table] key only when absent — preserves a Codex App feature the user toggled off
// (so SKS never re-enables / re-surfaces UI the user hid). On a fresh config the key/table
// is still created, preserving fresh-install enablement.
function upsertTomlTableKeyIfAbsent(text: any, table: any, line: any) {
  const key = String(line).split('=')[0]?.trim() ?? '';
  return hasTomlTableKey(text, table, key) ? String(text || '') : upsertTomlTableKey(text, table, line);
}

function upsertTopLevelTomlBooleanIfAbsent(text: any, key: any, value: any) {
  return hasTopLevelTomlKey(text, key) ? String(text || '') : upsertTopLevelTomlBoolean(text, key, value);
}

function ensureTrailingNewline(text: any = '') {
  const value = String(text || '').trimEnd();
  return value ? `${value}\n` : '';
}

function upsertTopLevelTomlString(text: any, key: any, value: any) {
  const line = `${key} = "${value}"`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i++) {
    const ln = lines[i];
    if (ln === undefined) continue;
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(ln)) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function hasTopLevelTomlKey(text: any, key: any) {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  for (let i = 0; i < end; i += 1) {
    if (typeof lines[i] === 'string' && pattern.test(lines[i] as string)) return true;
  }
  return false;
}

// Preserve a user's deliberate top-level scalar (model/service_tier/reasoning); only set
// the SKS default when the key is ABSENT. This is what stops `npm i -g` from clobbering
// a user's global Codex config on every update.
function upsertTopLevelTomlStringIfAbsent(text: any, key: any, value: any) {
  return hasTopLevelTomlKey(text, key) ? String(text || '') : upsertTopLevelTomlString(text, key, value);
}

// Lightweight safety gate: detect clearly-broken TOML so we never overwrite (or produce)
// an unparseable config that Codex itself would reject. Mirrors the project-config smoke.
function codexConfigParseSmoke(text: any = '') {
  const str = String(text || '');
  const tripleTokens = (str.match(/"""|'''/g) || []).length;
  const unterminatedTriple = tripleTokens % 2 !== 0;
  const invalidHeader = str.split('\n').find((line) => /^\s*\[/.test(line) && !/^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/.test(line)) || null;
  return { ok: !unterminatedTriple && !invalidHeader, unterminated_multiline_string: unterminatedTriple, invalid_table_header: invalidHeader };
}

async function backupCodexConfig(configPath: string, text: string, tag: string) {
  try {
    const stamp = `${PACKAGE_VERSION}-${Date.now().toString(36)}`;
    const backupPath = `${configPath}.sks-${tag}-${stamp}.bak`;
    await writeTextAtomic(backupPath, text);
    await cleanupCodexConfigBackups(configPath, { keepPerTag: 3, maxAgeMs: 30 * 24 * 60 * 60 * 1000 }).catch(() => undefined);
    return backupPath;
  } catch {
    return null;
  }
}

// Single TOML-safe gate for every codex-lb config write. Mirrors the fast-mode safety so the
// codex-lb path can NEVER corrupt ~/.codex/config.toml on install (esp. a fresh/initial one):
//   - refuse to overwrite an existing config that is already unparseable (back it up, bail),
//   - refuse to WRITE a result that would not parse (e.g. a regex helper mangled a multiline
//     string), leaving the existing config untouched,
//   - otherwise back up the prior config before mutating.
export async function safeWriteCodexConfigToml(configPath: string, current: string, next: string, tag = 'codex-lb') {
  return writeCodexConfigGuarded({
    configPath,
    before: String(current || ''),
    cause: tag,
    removeTopLevelModeLocks: true,
    mutate: () => String(next || '')
  });
}

export function codexFastModeDesktopStatus(text: any = '') {
  const validation = validateCodexConfigRoundTrip(String(text || ''));
  const profile = validation.parsed?.profiles?.['sks-fast-high'];
  const globalOn = validation.ok
    && validation.default_profile === 'sks-fast-high'
    && profile?.model === REQUIRED_CODEX_MODEL
    && profile?.service_tier === 'fast';
  return {
    schema: 'sks.codex-fast-mode-desktop-status.v1',
    ok: validation.ok,
    on: Boolean(globalOn),
    default_profile: validation.default_profile || null,
    top_level_default_profile: validation.top_level_default_profile === true,
    user_fast_mode_default_profile: validation.user_fast_mode_default_profile,
    profile_model: profile?.model || null,
    profile_service_tier: profile?.service_tier || null,
    validation
  };
}

function upsertTopLevelTomlBoolean(text: any, key: any, value: any) {
  const line = `${key} = ${value ? 'true' : 'false'}`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i += 1) {
    const ln = lines[i];
    if (ln === undefined) continue;
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(ln)) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function hasTomlTable(text: any, table: any) {
  const header = `[${table}]`;
  return String(text || '').split('\n').some((line) => String(line).trim() === header);
}

function upsertTomlTable(text: any, table: any, block: any) {
  let lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  const blockLines = String(block || '').trim().split('\n');
  if (start === -1) return [...lines, ...(lines.length ? [''] : []), ...blockLines].join('\n').replace(/\n{3,}/g, '\n\n');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln === undefined) continue;
    if (/^\s*\[.+\]\s*$/.test(ln)) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start, ...blockLines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function shellSingleQuote(value: any) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseCodexLbEnvKey(text: any = '') {
  return parseShellEnvValue(text, 'CODEX_LB_API_KEY');
}

function parseCodexLbEnvBaseUrl(text: any = '') {
  const value = parseShellEnvValue(text, 'CODEX_LB_BASE_URL');
  return value ? normalizeCodexLbBaseUrl(value) : '';
}

function parseCodexSharedLoginApiKey(text: any = '') {
  try {
    const parsed = JSON.parse(String(text || ''));
    const authMode = String(parsed?.auth_mode || parsed?.authMode || parsed?.mode || '').toLowerCase();
    const key = parsed?.key || parsed?.api_key || parsed?.apiKey || parsed?.openai_api_key || parsed?.OPENAI_API_KEY;
    if (!key || typeof key !== 'string') return '';
    if (authMode && !/api[-_]?key|apikey/.test(authMode)) return '';
    return key.trim();
  } catch {
    return '';
  }
}

function parseShellEnvValue(text: any = '', key: any = '') {
  const re = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`, 'm');
  const envMatch = String(text || '').match(re);
  const raw = envMatch?.[1]?.trim() || '';
  if (!raw) return '';
  if (raw.startsWith("'")) return raw.endsWith("'") && raw.length > 1 ? raw.slice(1, -1).replace(/'\\''/g, "'") : '';
  if (raw.startsWith('"')) return raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1).replace(/\\"/g, '"') : '';
  if (raw.includes("'") || raw.includes('"') || /\s/.test(raw)) return '';
  return raw;
}

function redactSecretText(text: any = '', secrets: any = []) {
  let out = String(text || '');
  for (const secret of secrets) {
    const value = String(secret || '');
    if (!value) continue;
    out = out.split(value).join('[redacted]');
  }
  return out;
}

async function sha256Text(value: any = '') {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function escapeRegExp(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function ensureSksCommandDuringInstall(opts: any = {}): Promise<SksPostinstallShimResult> {
  if (process.env.SKS_SKIP_POSTINSTALL_SHIM === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_SHIM=1' };
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? '';
  const nodeBin = opts.nodeBin || process.execPath;
  const target = opts.target || packagedSksEntrypoint();
  const repair = await reconcileSksPathShimsDuringInstall({ ...opts, pathEnv, nodeBin, target });
  if (repair.status === 'repaired') return { ...repair, command: repair.command || repair.repaired?.[0]?.path || target };
  if (repair.status === 'failed') return repair;
  const existing = await findCommandOnPath('sks', pathEnv);
  if (isStableSksBin(existing)) return { status: 'present', command: existing };
  const dirs = candidateShimDirs(pathEnv, opts.home || process.env.HOME);
  const script = process.platform === 'win32'
    ? `@echo off\r\n"${nodeBin}" "${target}" %*\r\n`
    : `#!/bin/sh\nexec "${nodeBin}" "${target}" "$@"\n`;
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  let createdFallback = null;
  let lastError = '';
  for (const entry of dirs) {
    const dest = path.join(entry.dir, `sks${suffix}`);
    try {
      await ensureDir(entry.dir);
      await writeTextAtomic(dest, script);
      if (process.platform !== 'win32') await fsp.chmod(dest, 0o755).catch(() => {});
      if (entry.onPath) return { status: 'created', command: dest };
      createdFallback ||= dest;
    } catch (err: any) {
      lastError = err.message;
    }
  }
  if (createdFallback) return { status: 'created_not_on_path', command: createdFallback };
  return { status: 'failed', error: lastError };
}

export async function selftestSksShimRepair() {
  const staleShimTmp = tmpdir();
  const staleBin = path.join(staleShimTmp, 'old-prefix', 'bin');
  const stalePkg = path.join(staleShimTmp, 'old-prefix', 'lib', 'node_modules', 'sneakoscope');
  await ensureDir(path.join(stalePkg, 'bin'));
  await ensureDir(staleBin);
  await writeTextAtomic(path.join(stalePkg, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '0.0.1' }, null, 2));
  await writeTextAtomic(path.join(stalePkg, 'bin', 'sks.js'), '#!/usr/bin/env node\nconsole.log("sneakoscope 0.0.1");\n');
  await fsp.chmod(path.join(stalePkg, 'bin', 'sks.js'), 0o755).catch(() => {});
  await fsp.symlink(path.join(stalePkg, 'bin', 'sks.js'), path.join(staleBin, 'sks'));
  const repair = await ensureSksCommandDuringInstall({ force: true, pathEnv: staleBin, home: path.join(staleShimTmp, 'home') });
  if (repair.status !== 'repaired') throw new Error(`selftest: stale global sks shim was not repaired (${repair.status})`);
  const run = await runProcess(path.join(staleBin, 'sks'), ['--version'], { timeoutMs: 10000, maxOutputBytes: 16 * 1024 });
  if (run.code !== 0 || !String(run.stdout || '').includes(PACKAGE_VERSION)) throw new Error('selftest: repaired stale sks shim does not run current package version');
  return { ok: true, repaired: repair.repaired || [] };
}

async function reconcileSksPathShimsDuringInstall(opts: any = {}): Promise<SksPostinstallShimResult> {
  if (process.env.SKS_SKIP_POSTINSTALL_SHIM_REPAIR === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_SHIM_REPAIR=1' };
  const target = opts.target || packagedSksEntrypoint();
  const nodeBin = opts.nodeBin || process.execPath;
  const currentVersion = await installedPackageVersion(packageRoot());
  const commands = await findCommandsOnPath(['sks', 'sneakoscope'], opts.pathEnv ?? process.env.PATH ?? '');
  const repaired: any[] = [];
  const failed: any[] = [];
  for (const command of commands) {
    const info = await inspectSksPathShim(command.path, { target, currentVersion });
    if (!info.repairable) continue;
    const script = process.platform === 'win32'
      ? `@echo off\r\n"${nodeBin}" "${target}" %*\r\n`
      : `#!/bin/sh\nexec "${nodeBin}" "${target}" "$@"\n`;
    try {
      await writeTextAtomic(command.path, script);
      if (process.platform !== 'win32') await fsp.chmod(command.path, 0o755).catch(() => {});
      repaired.push({ path: command.path, name: command.name, previous_version: info.version || null, target });
    } catch (err: any) {
      failed.push({ path: command.path, name: command.name, previous_version: info.version || null, error: err.message });
    }
  }
  if (repaired.length) return { status: 'repaired', command: repaired[0].path, repaired, failed };
  if (failed.length) return { status: 'failed', error: failed.map((entry: any) => `${entry.path}: ${entry.error}`).join('; '), failed };
  return { status: 'present' };
}

async function inspectSksPathShim(candidate: any, opts: any = {}) {
  if (!candidate || isTransientNpmBinPath(candidate)) return { repairable: false, reason: 'transient_or_missing' };
  const target = path.resolve(opts.target || packagedSksEntrypoint());
  const resolved = await fsp.realpath(candidate).catch(() => candidate);
  if (path.resolve(resolved) === target) return { repairable: false, reason: 'current_target' };
  const packageDir = sksPackageRootForBin(resolved) || sksPackageRootForBin(candidate);
  if (!packageDir) return { repairable: false, reason: 'not_sneakoscope_bin' };
  const version = await installedPackageVersion(packageDir);
  const currentVersion = opts.currentVersion || await installedPackageVersion(packageRoot());
  if (!version || !currentVersion || compareVersions(version, currentVersion) >= 0) return { repairable: false, reason: 'not_older', version, current_version: currentVersion };
  return { repairable: true, version, current_version: currentVersion, package_dir: packageDir, resolved };
}

function sksPackageRootForBin(file: any) {
  const normalized = String(file || '').split(path.sep).join('/');
  const marker = '/node_modules/sneakoscope/bin/';
  const idx = normalized.lastIndexOf(marker);
  if (idx < 0) return null;
  return normalized.slice(0, idx + '/node_modules/sneakoscope'.length).split('/').join(path.sep);
}

async function installedPackageVersion(root: any) {
  const pkg = await readJsonMaybe(path.join(root, 'package.json'));
  return pkg?.version || (root === packageRoot() ? PACKAGE_VERSION : null);
}

async function readJsonMaybe(file: any) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return null; }
}

function candidateShimDirs(pathEnv: any, home: any) {
  const seen = new Set();
  const out: any[] = [];
  for (const raw of String(pathEnv || '').split(path.delimiter).filter(Boolean)) {
    const dir = path.resolve(raw);
    if (seen.has(dir) || isTransientNpmBinPath(dir)) continue;
    seen.add(dir);
    out.push({ dir, onPath: true });
  }
  for (const raw of [home && path.join(home, '.local', 'bin'), home && path.join(home, 'bin')].filter(Boolean)) {
    const dir = path.resolve(raw);
    if (seen.has(dir)) continue;
    seen.add(dir);
    out.push({ dir, onPath: false });
  }
  return out;
}

async function findCommandOnPath(name: any, pathEnv: any) {
  const found = await findCommandsOnPath([name], pathEnv);
  return found[0]?.path || null;
}

async function findCommandsOnPath(names: any, pathEnv: any) {
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  const out: any[] = [];
  const seen = new Set();
  for (const dir of String(pathEnv || '').split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      for (const suffix of suffixes) {
        const candidate = path.join(dir, `${name}${suffix}`);
        const key = path.resolve(candidate);
        if (seen.has(key) || !await exists(candidate)) continue;
        seen.add(key);
        out.push({ name, path: candidate });
      }
    }
  }
  return out;
}

async function ensureGlobalContext7DuringInstall() {
  if (process.env.SKS_SKIP_POSTINSTALL_CONTEXT7 === '1') return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_CONTEXT7=1' };
  const codex = await getCodexInfo().catch(() => EMPTY_CODEX_INFO);
  if (!codex.bin) return { status: 'codex_missing' };
  const env = withoutSecretEnv(['CODEX_LB_API_KEY']);
  const existing = await context7GlobalMcpStatus(codex.bin, env);
  if (existing.present) return { status: 'present' };
  const add = await runProcess(codex.bin, ['mcp', 'add', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp@latest'], { env, timeoutMs: 30000, maxOutputBytes: 64 * 1024 }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  if (add.code === 0) return { status: 'installed' };
  return { status: 'failed', error: `${add.stderr || add.stdout || 'codex mcp add failed'}`.trim() };
}

export async function context7GlobalMcpStatus(codexBin: any, env: any = process.env) {
  const list = await runProcess(codexBin, ['mcp', 'list'], { env, timeoutMs: 8000, maxOutputBytes: 32 * 1024 })
    .catch((err: any) => ({ code: 1, stderr: err.message, stdout: '' }));
  const output = `${list.stdout || ''}\n${list.stderr || ''}`;
  return {
    checked: true,
    ok: list.code === 0,
    present: list.code === 0 && /context7/i.test(output),
    stdout: list.stdout || '',
    stderr: list.stderr || ''
  };
}

function withoutSecretEnv(keys: any = []) {
  const env = { ...process.env };
  for (const key of keys) env[key] = '';
  return env;
}

export async function ensureGlobalCodexSkillsDuringInstall(opts: any = {}) {
  if (process.env.SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS=1' };
  const home = opts.home || process.env.HOME || os.homedir();
  if (!home) return { status: 'skipped', reason: 'home directory unavailable' };
  const root = globalCodexSkillsRoot(home);
  try {
    const install = await installGlobalSkills(home);
    const skills = await checkRequiredSkills(home, root);
    return {
      status: skills.ok ? 'installed' : 'partial',
      root,
      installed_count: install.installed.length,
      removed_aliases: [],
      removed_stale_generated_skills: install.removed,
      missing_skills: skills.missing
    };
  } catch (err: any) {
    return { status: 'failed', root, error: err.message };
  }
}

async function ensureGlobalGetdesignSkillDuringInstall() {
  if (process.env.SKS_SKIP_POSTINSTALL_GETDESIGN === '1') return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_GETDESIGN=1' };
  const pathEnv = process.env.PATH || '';
  const skillsBin = await findCommandOnPath('skills', pathEnv);
  if (!skillsBin) return { status: 'skills_cli_missing', install: GETDESIGN_REFERENCE.codex_skill_install };
  const add = await runProcess(skillsBin, ['add', GETDESIGN_REFERENCE.codex_skill], {
    timeoutMs: 30000,
    maxOutputBytes: 64 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  const out = `${add.stdout || ''}\n${add.stderr || ''}`;
  if (add.code === 0) return { status: /already|exists|present/i.test(out) ? 'present' : 'installed', command: skillsBin };
  if (/already|exists|present/i.test(out)) return { status: 'present', command: skillsBin };
  return { status: 'failed', command: skillsBin, error: out.trim() || 'skills add failed' };
}

export async function ensureCodexImagegenDuringInstall(opts: any = {}) {
  if (process.env.SKS_POSTINSTALL_SKIP_IMAGEGEN_REPAIR === '1' || opts.skip === true) {
    return { status: 'skipped', reason: 'SKS_POSTINSTALL_SKIP_IMAGEGEN_REPAIR' };
  }
  const report = await repairCodexImagegen({
    root: opts.root || process.cwd(),
    apply: opts.apply !== false,
    codexBin: opts.codexBin || null,
    autoInstallCodex: opts.autoInstallCodex === true || process.env.SKS_IMAGEGEN_AUTO_INSTALL_CODEX === '1'
  }).catch((err: any) => ({
    recovered: false,
    blockers: [err?.message || String(err)],
    before: null,
    after: null
  }));
  if ((report as any).before?.core_ready === true || ((report as any).after?.core_ready === true && (report as any).attempted === false)) {
    return { status: 'ready', report };
  }
  if ((report as any).recovered === true) return { status: 'recovered', report };
  return { status: 'blocked', blockers: (report as any).blockers || ['codex_imagegen_unavailable'], report };
}

export async function ensureRelatedCliTools(args: any = []) {
  const skip = args.includes('--skip-cli-tools') || process.env.SKS_SKIP_CLI_TOOLS === '1';
  const codex = await ensureCodexCliTool({ skip, args });
  const zellijRepair = skip ? { status: 'skipped', reason: 'SKS_SKIP_CLI_TOOLS=1 or --skip-cli-tools' } : await ensureZellijCliTool(args);
  const zellij = await checkZellijCapability({ require: false, writeReport: false });
  return {
    codex,
    zellij: {
      ok: zellij.status === 'ok',
      bin: zellij.bin,
      version: zellij.version,
      min_version: zellij.min_version,
      current_session: false,
      repair: zellijRepair,
      install_hint: zellij.status === 'ok' ? null : zellijInstallHint(),
      error: (zellijRepair as any).error || zellij.blockers[0] || zellij.warnings[0] || null
    }
  };
}

export async function ensureMadLaunchDependencies(args: any = []) {
  const skip = args.includes('--skip-cli-tools') || process.env.SKS_SKIP_CLI_TOOLS === '1';
  const zellijRepair = skip ? { target: 'zellij', status: 'skipped', reason: 'SKS_SKIP_CLI_TOOLS=1 or --skip-cli-tools' } : await ensureZellijCliTool(args);
  const zellij = await checkZellijCapability({ require: false, writeReport: false });
  const ready = zellij.status === 'ok';
  return {
    ready,
    actions: ready ? [] : [{
      target: 'zellij',
      status: zellijRepair.status,
      command: (zellijRepair as any).command || zellijInstallHint(),
      error: (zellijRepair as any).error || zellij.blockers[0] || zellij.warnings[0] || null,
      repair: zellijRepair
    }],
    status: {
      zellij: {
        ok: ready,
        status: zellij.status,
        version: zellij.version,
        min_version: zellij.min_version,
        repair: zellijRepair,
        install_hint: ready ? null : zellijInstallHint()
      }
    }
  };
}

export function formatMadLaunchDependencyAction(action: any = {}) {
  const command = action.command ? ` Run: ${action.command}.` : '';
  const error = action.error ? ` ${action.error}` : '';
  return `${action.target || 'dependency'} ${action.status || 'blocked'}.${command}${error}`.trim();
}

export async function ensureCodexCliTool({ skip = false, args = [] }: any = {}) {
  if (skip) return { status: 'skipped', reason: 'SKS_SKIP_CLI_TOOLS=1 or --skip-cli-tools' };
  const before = await getCodexInfo().catch(() => EMPTY_CODEX_INFO);
  if (before.bin) return { status: 'present', bin: before.bin, version: before.version || null };
  const npmBin = await which('npm');
  if (!npmBin) return { status: 'failed', error: 'npm not found on PATH; install Codex CLI manually with npm i -g @openai/codex@latest.' };
  const command = 'npm i -g @openai/codex@latest';
  if (args.includes('--dry-run')) return { status: 'dry_run', command, error: 'Codex CLI not found on PATH.' };
  if (!await confirmInstallYesDefault(`Codex CLI is missing. Install latest Codex CLI with ${command}?`, args)) {
    return { status: 'needs_approval', command, error: 'Codex CLI not found on PATH.' };
  }
  // Global package install is a confirmation-required mutation: route it through
  // the mutation guard so it is scope-checked and recorded in the ledger. The
  // user already approved via confirmInstallYesDefault above (confirmed:true).
  const installRoot = globalSksRoot();
  const installContract = createRequestedScopeContract({
    route: 'install', userRequest: command, projectRoot: installRoot, overrides: { package_install: true }
  });
  const install = await guardedPackageInstall(
    guardContextForRoute(installRoot, installContract, command),
    '@openai/codex@latest',
    { confirmed: true, command: npmBin, args: ['i', '-g', '@openai/codex@latest'], timeoutMs: 120000 }
  ).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) {
    return { status: 'failed', error: `${install.stderr || install.stdout || 'npm i -g @openai/codex@latest failed'}`.trim() };
  }
  const after = await getCodexInfo().catch(() => EMPTY_CODEX_INFO);
  return {
    status: after.bin ? 'installed' : 'installed_not_on_path',
    bin: after.bin || null,
    version: after.version || null,
    hint: after.bin ? null : 'npm completed, but codex is not on PATH. Restart the shell or set SKS_CODEX_BIN.'
  };
}

export async function ensureZellijCliTool(args: any = [], opts: any = {}) {
  const before = await checkZellijCapability({ require: false, writeReport: false });
  if (before.status === 'ok') return { target: 'zellij', status: 'present', bin: before.bin, version: before.version || null };
  const command = zellijInstallHint();
  if (process.platform !== 'darwin') return { target: 'zellij', status: 'manual_required', command, error: before.blockers[0] || before.warnings[0] || 'zellij not found' };
  const brew = await which('brew').catch(() => null);
  if (!brew) return { target: 'zellij', status: 'manual_required', command: 'Install Homebrew, then run: brew install zellij', error: before.blockers[0] || before.warnings[0] || 'zellij not found' };
  const repairCommand = command;
  if (args.includes('--dry-run') || opts.dryRun) return { target: 'zellij', status: 'dry_run', command: repairCommand, error: before.blockers[0] || before.warnings[0] || null };
  const hasInstalledZellij = Boolean(before.version);
  const question = hasInstalledZellij
    ? `Homebrew Zellij ${before.version || 'unknown'} is not ready. Upgrade to latest Zellij with ${repairCommand}?`
    : `Zellij is missing. Install latest Zellij with ${repairCommand}?`;
  if (!await confirmInstallYesDefault(question, args)) return { target: 'zellij', status: 'needs_approval', command: repairCommand, error: before.blockers[0] || before.warnings[0] || null };
  const brewArgs = hasInstalledZellij ? ['upgrade', 'zellij'] : ['install', 'zellij'];
  const zellijRoot = globalSksRoot();
  const zellijContract = createRequestedScopeContract({
    route: 'install', userRequest: repairCommand, projectRoot: zellijRoot, overrides: { package_install: true, zellij_install: true }
  });
  const install = await guardedPackageInstall(
    guardContextForRoute(zellijRoot, zellijContract, repairCommand),
    'zellij',
    { confirmed: true, command: brew, args: brewArgs, timeoutMs: 180000 }
  ).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) return { target: 'zellij', status: 'failed', command: repairCommand, error: `${install.stderr || install.stdout || repairCommand + ' failed'}`.trim() };
  const after = await checkZellijCapability({ require: false, writeReport: false });
  if (after.status !== 'ok') return { target: 'zellij', status: 'installed_not_ready', command: repairCommand, error: after.blockers[0] || after.warnings[0] || 'zellij installed but not ready' };
  return { target: 'zellij', status: hasInstalledZellij ? 'upgraded' : 'installed', command: repairCommand, bin: after.bin, version: after.version || null };
}

function zellijInstallHint() {
  return process.platform === 'darwin' ? 'brew install zellij' : 'Install Zellij from https://zellij.dev/documentation/installation.html';
}

async function confirmInstallYesDefault(question: any, args: any = []) {
  if (hasFlag(args, '--from-postinstall') && process.env.SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS !== '1') return false;
  if (shouldAutoApproveInstall(args)) return true;
  if (!canAskYesNo()) return false;
  const answer = (await askPostinstallQuestion(`${question} [Y/n] `)).trim();
  return answer === '' || /^(y|yes|예|네|응)$/i.test(answer);
}

export async function maybePromptCodexUpdateForLaunch(args: any = [], opts: any = {}) {
  if (hasFlag(args, '--json') || hasFlag(args, '--skip-cli-tools') || hasFlag(args, '--skip-codex-update') || process.env.SKS_SKIP_CODEX_UPDATE === '1') return { status: 'skipped' };
  const latest = await npmPackageVersion('@openai/codex');
  const codex = await getCodexInfo().catch(() => EMPTY_CODEX_INFO);
  const current = codexCliVersionNumber(codex.version);
  const command = 'npm i -g @openai/codex@latest';
  const label = opts.label || 'Zellij launch';
  const missing = !codex.bin;
  const updateAvailable = Boolean(latest.version && current && compareVersions(latest.version, current) > 0);
  if (!missing && !updateAvailable) return { status: 'current', latest: latest.version || null, current, bin: codex.bin || null, error: latest.error || null };
  const prompt = missing
    ? `Codex CLI missing. Install @openai/codex${latest.version ? ` ${latest.version}` : '@latest'} before ${label}? [Y/n] `
    : `Codex CLI ${current} -> ${latest.version} update before ${label}? [Y/n] `;
  if (shouldAutoApproveInstall(args)) return installCodexLatest(command, latest.version, current);
  if (!canAskYesNo()) {
    const reason = missing ? 'Codex CLI missing' : `Codex CLI update available: ${current} -> ${latest.version}`;
    console.log(`${reason}. Run: ${command}`);
    return { status: missing ? 'missing' : 'available', latest: latest.version || null, current, command, bin: codex.bin || null };
  }
  const answer = (await askPostinstallQuestion(prompt)).trim();
  const yes = answer === '' || /^(y|yes|예|네|응)$/i.test(answer);
  if (!yes) return { status: 'skipped_by_user', latest: latest.version || null, current, command, bin: codex.bin || null };
  return installCodexLatest(command, latest.version, current);
}

export async function maybePromptSksUpdateForLaunch(args: any = [], opts: any = {}) {
  void args;
  void opts;
  return {
    status: 'skipped',
    reason: 'manual_update_commands_only',
    current: PACKAGE_VERSION,
    latest: null,
    command: null
  };
}

export function shouldAutoApproveInstall(args: any = [], env: any = process.env) {
  if (hasFlag(args, '--from-postinstall') && env.SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS !== '1') return false;
  if (hasFlag(args, '--from-postinstall') && env.SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS === '1') return true;
  return hasFlag(args, '--yes') || hasFlag(args, '-y') || isAgentRuntime(env);
}

function canAskYesNo() {
  return Boolean(input.isTTY && output.isTTY && process.env.CI !== 'true');
}

function hasFlag(args: any = [], name: any) {
  return args.includes(name);
}

function isAgentRuntime(env: any = process.env) {
  return [
    'SKS_OPENCLAW',
    'OPENCLAW',
    'OPENCLAW_AGENT',
    'OPENCLAW_RUN_ID',
    'OPENCLAW_SESSION_ID',
    'SKS_HERMES',
    'HERMES_AGENT',
    'HERMES_RUN_ID',
    'HERMES_SESSION_ID'
  ]
    .some((key: any) => /^(1|true|yes|y)$/i.test(String(env[key] || '').trim()));
}

async function installCodexLatest(command: any, latestVersion: any, previousVersion: any = null) {
  const npm = await which('npm').catch(() => null);
  if (!npm) return { status: 'failed', latest: latestVersion || null, previous: previousVersion || null, command, error: 'npm not found on PATH' };
  const install = await runProcess(npm, ['i', '-g', '@openai/codex@latest'], { timeoutMs: 180000, maxOutputBytes: 128 * 1024 }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) return { status: 'failed', latest: latestVersion || null, previous: previousVersion || null, command, error: `${install.stderr || install.stdout || command + ' failed'}`.trim() };
  const after = await getCodexInfo().catch(() => EMPTY_CODEX_INFO);
  const afterVersion = codexCliVersionNumber(after.version);
  if (!after.bin) return { status: 'updated_not_reflected', latest: latestVersion || null, previous: previousVersion || null, version: afterVersion || null, command, error: 'npm completed, but codex is not on PATH. Restart the shell or set SKS_CODEX_BIN.' };
  if (latestVersion && afterVersion && compareVersions(afterVersion, latestVersion) < 0) {
    return { status: 'updated_not_reflected', latest: latestVersion, previous: previousVersion || null, version: afterVersion, bin: after.bin, command, error: `npm completed, but PATH still resolves Codex CLI ${afterVersion}; expected ${latestVersion}.` };
  }
  console.log(`Codex CLI ready: ${previousVersion || 'missing'} -> ${after.version || after.bin}`);
  return { status: previousVersion ? 'updated' : 'installed', latest: latestVersion || null, previous: previousVersion || null, version: afterVersion || null, raw_version: after.version || null, bin: after.bin || null, command };
}

function codexCliVersionNumber(versionText: any = '') {
  const match = String(versionText || '').match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  return match ? match[1] : null;
}

async function npmPackageVersion(name: any) {
  const envName = `SKS_NPM_VIEW_${String(name || '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_VERSION`;
  if (process.env[envName]) return { version: process.env[envName] };
  const npm = await which('npm').catch(() => null);
  if (!npm) return { error: 'npm not found' };
  const result = await runProcess(npm, ['view', name, 'version'], { timeoutMs: 5000, maxOutputBytes: 4096 });
  if (result.code !== 0) return { error: `${result.stderr || result.stdout || 'npm view failed'}`.trim() };
  return { version: result.stdout.trim().split(/\s+/).pop() };
}

function compareVersions(a: any, b: any) {
  const pa = String(a || '').split(/[.-]/).map((x: any) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x: any) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function isProjectSetupCandidate(root: any) {
  const markers = ['package.json', '.git', 'AGENTS.md', '.codex', '.sneakoscope'];
  for (const marker of markers) {
    if (await exists(path.join(root, marker))) return true;
  }
  return false;
}

export async function checkContext7(root: any) {
  const projectPath = path.join(root, '.codex', 'config.toml');
  const globalPath = path.join(process.env.HOME || '', '.codex', 'config.toml');
  const projectText = await safeReadText(projectPath);
  const globalText = await safeReadText(globalPath);
  const codex = await getCodexInfo().catch(() => EMPTY_CODEX_INFO);
  let list = { checked: false, ok: false, stdout: '', stderr: '' };
  if (codex.bin) {
    const out = await runProcess(codex.bin, ['mcp', 'list'], { timeoutMs: 8000, maxOutputBytes: 32 * 1024 }).catch((err: any) => ({ code: 1, stderr: err.message, stdout: '' }));
    list = { checked: true, ok: out.code === 0 && /context7/i.test(`${out.stdout}\n${out.stderr}`), stdout: out.stdout || '', stderr: out.stderr || '' };
  }
  const result: {
    ok: boolean;
    project: { path: string; ok: boolean };
    global: { path: string; ok: boolean };
    codex_mcp_list: { checked: boolean; ok: boolean; stdout: string; stderr: string };
  } = {
    ok: false,
    project: { path: projectPath, ok: hasContext7ConfigText(projectText) },
    global: { path: globalPath, ok: hasContext7ConfigText(globalText) },
    codex_mcp_list: list
  };
  result.ok = result.project.ok || result.codex_mcp_list.ok || (result.global.ok && !list.checked);
  return result;
}

export async function ensureProjectContext7Config(root: any, transport: any = 'local') {
  const configPath = path.join(root, '.codex', 'config.toml');
  await ensureDir(path.dirname(configPath));
  const current = await safeReadText(configPath);
  const block = context7ConfigToml(transport).trim();
  const existingBlock = /(^|\n)\[mcp_servers\.context7\]\n[\s\S]*?(?=\n\[[^\]]+\]|\s*$)/;
  if (existingBlock.test(current)) {
    return false;
  }
  if (hasContext7ConfigText(current)) return false;
  await writeCodexConfigGuarded({
    root,
    configPath,
    before: current,
    cause: 'context7-project-config',
    mutate: () => `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`
  });
  return true;
}

export async function checkRequiredSkills(root: any, skillRoot: any = root ? path.join(root, '.agents', 'skills') : globalCodexSkillsRoot()) {
  const missing: any[] = [];
  for (const name of [...DOLLAR_SKILL_NAMES, ...RECOMMENDED_SKILLS]) {
    if (!(await exists(path.join(skillRoot, name, 'SKILL.md')))) missing.push(name);
  }
  return { ok: missing.length === 0, root: skillRoot, missing };
}

export function globalCodexSkillsRoot(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.agents', 'skills');
}

function isStableSksBin(candidate: any) {
  return Boolean(candidate) && !isTransientNpmBinPath(candidate);
}

function isTransientNpmBinPath(candidate: any) {
  const normalized = String(candidate || '').split(path.sep).join('/');
  return normalized.includes('/_npx/')
    || normalized.includes('/_cacache/tmp/')
    || /\/npm-cache\/_npx\//.test(normalized)
    || (/\/node_modules\/\.bin\/sks$/.test(normalized) && normalized.includes('/.npm-cache/'));
}

async function safeReadText(file: any, fallback: any = '') {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch {
    return fallback;
  }
}

async function codexLbLoginCallCount(home: any) {
  return (await safeReadText(path.join(home, '.codex', 'login-calls.log'))).trim().split(/\r?\n/).filter(Boolean).length;
}

function codexLbPostinstallEnv(baseEnv: any, overrides: any = {}) {
  return {
    ...baseEnv,
    SKS_POSTINSTALL_NO_BOOTSTRAP: '1',
    SKS_SKIP_POSTINSTALL_SHIM: '1',
    SKS_SKIP_POSTINSTALL_CONTEXT7: '1',
    SKS_SKIP_POSTINSTALL_GETDESIGN: '1',
    SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1',
    SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH: '0',
    SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1',
    SKS_SKIP_CODEX_APP_UPGRADE_REPAIR: '1',
    ...overrides
  };
}

export async function selftestCodexLb(tmp: any) {
  const codexLbHome = path.join(tmp, 'codex-lb-home');
  await ensureDir(path.join(codexLbHome, '.codex'));
  const codexLbFakeBin = path.join(tmp, 'codex-lb-fake-bin');
  await ensureDir(codexLbFakeBin);
  const codexLbFakeCodex = path.join(codexLbFakeBin, 'codex');
  // NOTE: printf format uses literal double-quotes inside single-quoted shell strings so the
  // fake login writes proper JSON in both bash and dash (where `\"` is a non-standard printf
  // escape that dash emits literally and bash collapses to `"`).
  await writeTextAtomic(codexLbFakeCodex, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo \"codex-cli 99.0.0\"; exit 0; fi\nif [ \"$1\" = \"login\" ] && [ \"$2\" = \"status\" ]; then echo \"logged in with browser auth\"; exit 0; fi\nif [ \"$1\" = \"login\" ] && [ \"$2\" = \"--with-api-key\" ]; then read key; mkdir -p \"$HOME/.codex\"; printf '{\"auth_mode\":\"apikey\",\"OPENAI_API_KEY\":\"%s\"}\\n' \"$key\" > \"$HOME/.codex/auth.json\"; printf '%s\\n' \"$key\" >> \"$HOME/.codex/login-calls.log\"; exit 0; fi\necho \"fake codex unsupported\" >&2\nexit 1\n");
  await fsp.chmod(codexLbFakeCodex, 0o755);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `model = "${REQUIRED_CODEX_MODEL}"\nmodel_reasoning_effort = "low"\nservice_tier = "fast"\nsuppress_unstable_features_warning = true\n\n[profiles.custom]\nmodel_reasoning_effort = "low"\n\n[notice]\nfast_default_opt_out = true\n\n[features]\nhooks = true\n`);
  const codexLbEnvForSelftest = { HOME: codexLbHome, SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-global'), PATH: `${codexLbFakeBin}${path.delimiter}${process.env.PATH || ''}`, SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' };
  const codexLbSetup = await runProcess(process.execPath, [packagedSksEntrypoint(), 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key', 'sk-test', '--json'], {
    cwd: tmp,
    env: codexLbEnvForSelftest,
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (codexLbSetup.code !== 0) throw new Error(`selftest: codex-lb setup exited ${codexLbSetup.code}: ${codexLbSetup.stderr}`);
  const codexLbSetupJson = JSON.parse(codexLbSetup.stdout);
  const codexLbConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  const codexLbEnv = await safeReadText(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'));
  const codexLbAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (!codexLbSetupJson.ok || codexLbSetupJson.base_url !== 'https://lb.example.test/backend-api/codex' || !hasTopLevelCodexLbSelected(codexLbConfig) || !codexLbConfig.includes('[model_providers.codex-lb]') || !codexLbEnv.includes("CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'") || !codexLbEnv.includes("CODEX_LB_API_KEY='sk-test'") || codexLbSetupJson.codex_environment?.ok !== true || codexLbSetupJson.codex_login?.status !== 'apikey_forced' || !codexLbAuth.includes('OPENAI_API_KEY') || !codexLbAuth.includes('sk-test')) throw new Error('selftest: codex-lb setup');
  if (!codexLbConfig.includes('requires_openai_auth = true') || !codexLbConfig.includes('name = "openai"')) throw new Error('selftest: codex-lb setup did not write current codex-lb App provider contract');
  const codexLbFailLaunchctl = path.join(codexLbFakeBin, 'launchctl-fail');
  await writeTextAtomic(codexLbFailLaunchctl, '#!/bin/sh\necho "launchctl denied" >&2\nexit 7\n');
  await fsp.chmod(codexLbFailLaunchctl, 0o755);
  const codexLbFailedLaunchEnv = await configureCodexLb({ home: path.join(tmp, 'codex-lb-launch-fail-home'), host: 'lb.example.test', apiKey: 'sk-fail', forceLaunchEnv: true, launchctlBin: codexLbFailLaunchctl });
  if (codexLbFailedLaunchEnv.ok || codexLbFailedLaunchEnv.status !== 'launch_env_failed' || !/launchctl denied/.test(codexLbFailedLaunchEnv.error || '')) throw new Error('selftest: codex-lb setup must expose launch-env failure');
  if (!hasCodexUnstableFeatureWarningSuppression(codexLbConfig)) throw new Error('selftest: codex-lb setup did not suppress Codex unstable feature warning');
  await initProject(codexLbHome, { installScope: 'global', force: true, repair: true });
  const codexLbRepairSetupConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (!hasTopLevelCodexLbSelected(codexLbRepairSetupConfig) || !codexLbRepairSetupConfig.includes('[model_providers.codex-lb]') || !codexLbRepairSetupConfig.includes('https://lb.example.test/backend-api/codex') || codexLbRepairSetupConfig.includes('sk-test')) throw new Error('selftest: init codex-lb');
  if (!codexLbRepairSetupConfig.includes('requires_openai_auth = true') || !codexLbRepairSetupConfig.includes('name = "openai"')) throw new Error('selftest: init codex-lb did not preserve current App provider contract');
  if (!hasCodexUnstableFeatureWarningSuppression(codexLbRepairSetupConfig)) throw new Error('selftest: init codex-lb did not suppress Codex unstable feature warning');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `${codexLbConfig}\n[mcp_servers.supabase]\nurl = "https://mcp.supabase.com/mcp?project_ref=ref&read_only=true&features=database,docs"\n`);
  const ptmp = path.join(tmp, 'codex-lb-project-config'), prevHome = process.env.HOME;
  try { process.env.HOME = codexLbHome; await initProject(ptmp, { installScope: 'global' }); }
  finally { if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome; }
  const pcfg = await safeReadText(path.join(ptmp, '.codex', 'config.toml'));
  if (!hasTopLevelCodexLbSelected(pcfg) || !pcfg.includes('[model_providers.codex-lb]') || !pcfg.includes('[mcp_servers.supabase]') || !pcfg.includes('read_only=true')) throw new Error('selftest: project codex-lb');
  if (!pcfg.includes('requires_openai_auth = true') || !pcfg.includes('name = "openai"')) throw new Error('selftest: project codex-lb did not copy current App provider contract');
  if (!hasCodexUnstableFeatureWarningSuppression(pcfg)) throw new Error('selftest: project codex-lb config did not suppress Codex unstable feature warning');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
  const codexLbRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'auth', 'repair', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbRepair.code !== 0) throw new Error(`selftest: codex-lb repair exited ${codexLbRepair.code}: ${codexLbRepair.stderr}`);
  const codexLbRepairJson = JSON.parse(codexLbRepair.stdout);
  const codexLbRepairedAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (!codexLbRepairJson.ok || codexLbRepairJson.status !== 'repaired' || codexLbRepairJson.codex_environment?.ok !== true || codexLbRepairJson.codex_login?.status !== 'skipped' || !codexLbRepairedAuth.includes('"auth_mode":"browser"') || codexLbRepairedAuth.includes('sk-test')) throw new Error('selftest: codex-lb repair');
  const codexLbLegacyRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'auth', 'repair', '--json'], { cwd: tmp, env: { ...codexLbEnvForSelftest, SKS_CODEX_LB_SYNC_CODEX_LOGIN: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbLegacyRepair.code !== 0) throw new Error(`selftest: codex-lb legacy login repair exited ${codexLbLegacyRepair.code}: ${codexLbLegacyRepair.stderr}`);
  const codexLbLegacyRepairJson = JSON.parse(codexLbLegacyRepair.stdout);
  const codexLbLegacyAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (!codexLbLegacyRepairJson.ok || codexLbLegacyRepairJson.codex_login?.status !== 'synced' || !codexLbLegacyAuth.includes('"auth_mode":"apikey"') || !codexLbLegacyAuth.includes('sk-test')) throw new Error('selftest: codex-lb legacy login repair');
  const codexLbLoginCallsBeforePostinstall = await codexLbLoginCallCount(codexLbHome);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
  const codexLbPostinstall = await runProcess(process.execPath, [packagedSksEntrypoint(), 'postinstall'], {
    cwd: tmp,
    env: codexLbPostinstallEnv(codexLbEnvForSelftest),
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  if (codexLbPostinstall.code !== 0) throw new Error(`selftest: codex-lb postinstall auth preservation exited ${codexLbPostinstall.code}: ${codexLbPostinstall.stderr}`);
  const codexLbPostinstallAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbLoginCallsAfterPostinstall = await codexLbLoginCallCount(codexLbHome);
  if (!String(codexLbPostinstall.stdout || '').includes('codex-lb auth: preserved') || !codexLbPostinstallAuth.includes('"auth_mode":"browser"') || codexLbPostinstallAuth.includes('sk-test') || codexLbLoginCallsAfterPostinstall !== codexLbLoginCallsBeforePostinstall) throw new Error('selftest: postinstall auth');
  const postinstallEnvKeys = ['HOME', 'PATH', 'INIT_CWD', 'SKS_GLOBAL_ROOT', 'SKS_POSTINSTALL_BOOTSTRAP', 'SKS_POSTINSTALL_NO_BOOTSTRAP', 'SKS_SKIP_POSTINSTALL_SHIM', 'SKS_SKIP_POSTINSTALL_CONTEXT7', 'SKS_SKIP_POSTINSTALL_GETDESIGN', 'SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS', 'SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH', 'SKS_SKIP_CODEX_LB_LAUNCH_ENV', 'SKS_SKIP_CODEX_APP_UPGRADE_REPAIR', 'SKS_CODEX_LB_SYNC_CODEX_LOGIN'];
  const postinstallEnvBefore = Object.fromEntries(postinstallEnvKeys.map((key: any) => [key, process.env[key]]));
  const codexLbLoginCallsBeforeBootstrap = await codexLbLoginCallCount(codexLbHome);
  try {
    for (const key of postinstallEnvKeys) delete process.env[key];
    Object.assign(process.env, {
      HOME: codexLbHome,
      PATH: `${codexLbFakeBin}${path.delimiter}${postinstallEnvBefore.PATH || ''}`,
      INIT_CWD: tmp,
      SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-postinstall-global'),
      SKS_POSTINSTALL_BOOTSTRAP: '1',
      SKS_SKIP_POSTINSTALL_SHIM: '1',
      SKS_SKIP_POSTINSTALL_CONTEXT7: '1',
      SKS_SKIP_POSTINSTALL_GETDESIGN: '1',
      SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1',
      SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH: '0',
      SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1',
      SKS_SKIP_CODEX_APP_UPGRADE_REPAIR: '1'
    });
    await postinstall({
      bootstrap: async () => {
        await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
        await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `model = "${REQUIRED_CODEX_MODEL}"\nservice_tier = "fast"\nsuppress_unstable_features_warning = true\n\n[features]\nhooks = true\n`);
      }
    });
  } finally {
    for (const key of postinstallEnvKeys) {
      if (postinstallEnvBefore[key] === undefined) delete process.env[key];
      else process.env[key] = postinstallEnvBefore[key];
    }
  }
  const codexLbPostBootstrapAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbPostBootstrapConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  const codexLbLoginCallsAfterBootstrap = await codexLbLoginCallCount(codexLbHome);
  if (!codexLbPostBootstrapAuth.includes('"auth_mode":"browser"') || codexLbPostBootstrapAuth.includes('sk-test') || codexLbLoginCallsAfterBootstrap !== codexLbLoginCallsBeforeBootstrap) throw new Error('selftest: postinstall drift auth');
  if (!hasTopLevelCodexLbSelected(codexLbPostBootstrapConfig) || !codexLbPostBootstrapConfig.includes('[model_providers.codex-lb]') || !codexLbPostBootstrapConfig.includes('https://lb.example.test/backend-api/codex') || codexLbPostBootstrapConfig.includes('sk-test')) throw new Error('selftest: postinstall drift config');
  if (!codexLbPostBootstrapConfig.includes('requires_openai_auth = true') || !codexLbPostBootstrapConfig.includes('name = "openai"')) throw new Error('selftest: postinstall drift config did not restore current App provider contract');
  const doctorProject = tmpdir();
  await ensureDir(path.join(doctorProject, '.git'));
  await writeTextAtomic(path.join(doctorProject, 'package.json'), '{"name":"codex-lb-doctor-project","version":"0.0.0"}\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n");
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `model = "${REQUIRED_CODEX_MODEL}"\nservice_tier = "fast"\nsuppress_unstable_features_warning = true\n\n[features]\nhooks = true\n`);
  const codexLbDoctorRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'doctor', '--fix', '--json'], {
    cwd: doctorProject,
    env: { ...codexLbEnvForSelftest, SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-doctor-global') },
    timeoutMs: 30000,
    maxOutputBytes: 256 * 1024
  });
  if (codexLbDoctorRepair.code !== 0) throw new Error(`selftest: doctor --fix codex-lb repair exited ${codexLbDoctorRepair.code}: ${codexLbDoctorRepair.stderr}`);
  const codexLbDoctorJson = JSON.parse(codexLbDoctorRepair.stdout);
  const codexLbDoctorAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbDoctorConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (!codexLbDoctorJson.repair?.codex_lb?.ok || !codexLbDoctorJson.repair.codex_lb.config_repaired || !codexLbDoctorJson.codex_lb?.ok || !codexLbDoctorAuth.includes('"auth_mode":"browser"') || codexLbDoctorAuth.includes('sk-test') || !hasTopLevelCodexLbSelected(codexLbDoctorConfig) || !codexLbDoctorConfig.includes('https://lb.example.test/backend-api/codex') || !hasCodexUnstableFeatureWarningSuppression(codexLbDoctorConfig)) throw new Error('selftest: doctor codex-lb');
  if (!codexLbDoctorConfig.includes('requires_openai_auth = true') || !codexLbDoctorConfig.includes('name = "openai"')) throw new Error('selftest: doctor codex-lb did not restore current App provider contract');
  // codex-lb auth: ChatGPT OAuth ↔ codex-lb env_key conflict reconciliation.
  const oauthAuthJson = JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: { id_token: 'oauth-id', access_token: 'oauth-access', refresh_token: 'oauth-refresh' },
    last_refresh: '2026-01-01T00:00:00Z'
  });
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), `${oauthAuthJson}\n`);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n");
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model_provider = "codex-lb"\n\n[model_providers.codex-lb]\nname = "openai"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nenv_key = "CODEX_LB_API_KEY"\nsupports_websockets = true\nrequires_openai_auth = true\n');
  await fsp.rm(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), { force: true });
  const codexLbReconcileRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'auth', 'repair', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReconcileRepair.code !== 0) throw new Error(`selftest: codex-lb oauth reconcile repair exited ${codexLbReconcileRepair.code}: ${codexLbReconcileRepair.stderr}`);
  const codexLbReconcileJson = JSON.parse(codexLbReconcileRepair.stdout);
  const codexLbReconcileAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbReconcileBackup = await safeReadText(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'));
  if (codexLbReconcileJson.auth_reconcile?.status !== 'oauth_preserved' || !codexLbReconcileAuth.includes('oauth-id') || !codexLbReconcileAuth.includes('oauth-refresh') || codexLbReconcileAuth.includes('sk-test') || !codexLbReconcileBackup.includes('oauth-id') || !codexLbReconcileBackup.includes('oauth-refresh')) throw new Error('selftest: codex-lb oauth reconcile should preserve ChatGPT OAuth and back it up');
  // Opt-out path: SKS_CODEX_LB_NO_AUTH_RECONCILE=1 keeps auth.json untouched but still backs up the OAuth blob.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), `${oauthAuthJson}\n`);
  await fsp.rm(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), { force: true });
  const codexLbReconcileOptOutRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'auth', 'repair', '--json'], { cwd: tmp, env: { ...codexLbEnvForSelftest, SKS_CODEX_LB_NO_AUTH_RECONCILE: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReconcileOptOutRepair.code !== 0) throw new Error(`selftest: codex-lb oauth reconcile opt-out repair exited ${codexLbReconcileOptOutRepair.code}: ${codexLbReconcileOptOutRepair.stderr}`);
  const codexLbReconcileOptOutJson = JSON.parse(codexLbReconcileOptOutRepair.stdout);
  const codexLbReconcileOptOutAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbReconcileOptOutBackup = await safeReadText(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'));
  if (codexLbReconcileOptOutJson.auth_reconcile?.status !== 'backup_only' || !codexLbReconcileOptOutAuth.includes('oauth-id') || !codexLbReconcileOptOutBackup.includes('oauth-id')) throw new Error('selftest: codex-lb oauth reconcile opt-out should back up but not rewrite auth.json');
  // Restore path: older SKS versions could leave the codex-lb API key in auth.json. Repair should
  // restore the ChatGPT OAuth backup while keeping codex-lb selected for provider routing.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","OPENAI_API_KEY":"sk-test"}\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), `${oauthAuthJson}\n`);
  const codexLbReconcileRestoreRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'auth', 'repair', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReconcileRestoreRepair.code !== 0) throw new Error(`selftest: codex-lb oauth restore repair exited ${codexLbReconcileRestoreRepair.code}: ${codexLbReconcileRestoreRepair.stderr}`);
  const codexLbReconcileRestoreJson = JSON.parse(codexLbReconcileRestoreRepair.stdout);
  const codexLbReconcileRestoreAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbReconcileRestoreConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (codexLbReconcileRestoreJson.auth_reconcile?.status !== 'oauth_restored' || !codexLbReconcileRestoreAuth.includes('oauth-id') || codexLbReconcileRestoreAuth.includes('sk-test') || !hasTopLevelCodexLbSelected(codexLbReconcileRestoreConfig)) throw new Error('selftest: codex-lb oauth restore should replace apikey auth.json with ChatGPT OAuth backup while keeping codex-lb selected');
  // codex-lb auth: release flow — restore ChatGPT OAuth from backup so the user can return to
  // the official ChatGPT account login. Default deselects model_provider; flags control whether
  // the provider stays selected and whether the backup file is removed after restore.
  const codexLbReleaseConfig = 'model_provider = "codex-lb"\n\n[model_providers.codex-lb]\nname = "openai"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nenv_key = "CODEX_LB_API_KEY"\nsupports_websockets = true\nrequires_openai_auth = true\n';
  const codexLbReleaseEnv = "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n";
  const codexLbReleaseApikeyAuth = '{"auth_mode":"apikey","OPENAI_API_KEY":"sk-test"}\n';
  const codexLbReleaseOauthBackup = `${oauthAuthJson}\n`;
  // Happy path: deselect model_provider and preserve backup file.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), codexLbReleaseOauthBackup);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), codexLbReleaseEnv);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbReleaseRun = await runProcess(process.execPath, [packagedSksEntrypoint(), 'codex-lb', 'release', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReleaseRun.code !== 0) throw new Error(`selftest: codex-lb release exited ${codexLbReleaseRun.code}: ${codexLbReleaseRun.stderr}`);
  const codexLbReleaseJson = JSON.parse(codexLbReleaseRun.stdout);
  const codexLbReleaseAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbReleaseBackupAfter = await safeReadText(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'));
  const codexLbReleaseConfigAfter = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (codexLbReleaseJson.status !== 'released' || codexLbReleaseJson.provider_unselected !== true || codexLbReleaseJson.backup_removed !== false || !codexLbReleaseAuth.includes('oauth-id') || !codexLbReleaseAuth.includes('oauth-refresh') || codexLbReleaseAuth.includes('apikey') || !codexLbReleaseBackupAfter.includes('oauth-id') || hasTopLevelCodexLbSelected(codexLbReleaseConfigAfter)) throw new Error('selftest: codex-lb release happy path did not restore OAuth, preserve backup, and deselect model_provider');
  // --keep-provider: restore auth.json but leave model_provider = "codex-lb" alone.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), codexLbReleaseOauthBackup);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbReleaseKeepRun = await runProcess(process.execPath, [packagedSksEntrypoint(), 'codex-lb', 'release', '--keep-provider', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReleaseKeepRun.code !== 0) throw new Error(`selftest: codex-lb release --keep-provider exited ${codexLbReleaseKeepRun.code}: ${codexLbReleaseKeepRun.stderr}`);
  const codexLbReleaseKeepJson = JSON.parse(codexLbReleaseKeepRun.stdout);
  const codexLbReleaseKeepConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (codexLbReleaseKeepJson.status !== 'released' || codexLbReleaseKeepJson.provider_unselected !== false || !hasTopLevelCodexLbSelected(codexLbReleaseKeepConfig)) throw new Error('selftest: codex-lb release --keep-provider should leave model_provider = "codex-lb" intact');
  // --delete-backup: restore auth.json and remove the backup file.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), codexLbReleaseOauthBackup);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbReleaseDeleteRun = await runProcess(process.execPath, [packagedSksEntrypoint(), 'codex-lb', 'release', '--delete-backup', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReleaseDeleteRun.code !== 0) throw new Error(`selftest: codex-lb release --delete-backup exited ${codexLbReleaseDeleteRun.code}: ${codexLbReleaseDeleteRun.stderr}`);
  const codexLbReleaseDeleteJson = JSON.parse(codexLbReleaseDeleteRun.stdout);
  const codexLbReleaseDeleteBackupExists = await exists(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'));
  if (codexLbReleaseDeleteJson.status !== 'released' || codexLbReleaseDeleteJson.backup_removed !== true || codexLbReleaseDeleteBackupExists) throw new Error('selftest: codex-lb release --delete-backup should remove the backup file after restore');
  // No backup: release should refuse and exit 1.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await fsp.rm(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), { force: true });
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbReleaseMissingRun = await runProcess(process.execPath, [packagedSksEntrypoint(), 'codex-lb', 'release', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const codexLbReleaseMissingJson = JSON.parse(codexLbReleaseMissingRun.stdout || '{}');
  const codexLbReleaseMissingAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (codexLbReleaseMissingRun.code === 0 || codexLbReleaseMissingJson.status !== 'no_backup' || !codexLbReleaseMissingAuth.includes('apikey')) throw new Error('selftest: codex-lb release with no backup should exit non-zero and report no_backup without touching auth.json');
  // unselect: flip model_provider off without touching auth.json or env file.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbUnselectRun = await runProcess(process.execPath, [packagedSksEntrypoint(), 'codex-lb', 'unselect', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbUnselectRun.code !== 0) throw new Error(`selftest: codex-lb unselect exited ${codexLbUnselectRun.code}: ${codexLbUnselectRun.stderr}`);
  const codexLbUnselectJson = JSON.parse(codexLbUnselectRun.stdout);
  const codexLbUnselectConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  const codexLbUnselectAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (codexLbUnselectJson.status !== 'unselected' || hasTopLevelCodexLbSelected(codexLbUnselectConfig) || !codexLbUnselectConfig.includes('[model_providers.codex-lb]') || !codexLbUnselectAuth.includes('apikey')) throw new Error('selftest: codex-lb unselect should drop model_provider but preserve [model_providers.codex-lb] and auth.json');
  // Restore the doctor-test auth.json shape so downstream selftest assertions still hold.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
  await fsp.rm(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), { force: true });
  const codexLbContext7Bin = path.join(tmp, 'codex-lb-context7-bin');
  await ensureDir(codexLbContext7Bin);
  await writeTextAtomic(path.join(codexLbContext7Bin, 'codex'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 99.0.0"; exit 0; fi\nif [ "$CODEX_LB_API_KEY" ]; then echo "context7 leaked CODEX_LB_API_KEY" >&2; exit 77; fi\nif [ "$1" = "mcp" ] && [ "$2" = "list" ]; then echo ""; exit 0; fi\nif [ "$1" = "mcp" ] && [ "$2" = "add" ]; then echo "context7 added"; exit 0; fi\necho "unexpected codex $*" >&2\nexit 2\n');
  await fsp.chmod(path.join(codexLbContext7Bin, 'codex'), 0o755);
  const codexLbContext7Postinstall = await runProcess(process.execPath, [packagedSksEntrypoint(), 'postinstall'], {
    cwd: tmp,
    env: {
      ...codexLbEnvForSelftest,
      PATH: `${codexLbContext7Bin}${path.delimiter}${process.env.PATH || ''}`,
      CODEX_LB_API_KEY: 'sk-test',
      SKS_POSTINSTALL_NO_BOOTSTRAP: '1',
      SKS_SKIP_POSTINSTALL_SHIM: '1',
      SKS_SKIP_POSTINSTALL_GETDESIGN: '1',
      SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1',
      SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH: '1'
    },
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  if (codexLbContext7Postinstall.code !== 0 || String(`${codexLbContext7Postinstall.stdout}\n${codexLbContext7Postinstall.stderr}`).includes('leaked CODEX_LB_API_KEY')) throw new Error('selftest: Context7 key leak');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_API_KEY='unterminated\n");
  const codexLbLoginCallsBeforeMalformed = await codexLbLoginCallCount(codexLbHome);
  const codexLbMalformedPostinstall = await runProcess(process.execPath, [packagedSksEntrypoint(), 'postinstall'], {
    cwd: tmp,
    env: codexLbPostinstallEnv(codexLbEnvForSelftest),
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  const codexLbLoginCallsAfterMalformed = await codexLbLoginCallCount(codexLbHome);
  if (codexLbMalformedPostinstall.code !== 0 || !String(codexLbMalformedPostinstall.stdout || '').includes('codex-lb auth: stored key missing') || codexLbLoginCallsAfterMalformed !== codexLbLoginCallsBeforeMalformed) throw new Error('selftest: bad codex-lb env');
  await fsp.rm(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), { force: true });
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), '[model_providers.codex-lb]\nname = "openai"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nsupports_websockets = true\nrequires_openai_auth = true\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-legacy"}\n');
  const codexLbLoginCallsBeforeLegacyPostinstall = await codexLbLoginCallCount(codexLbHome);
  const codexLbLegacyPostinstall = await runProcess(process.execPath, [packagedSksEntrypoint(), 'postinstall'], {
    cwd: tmp,
    env: codexLbPostinstallEnv(codexLbEnvForSelftest),
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  if (codexLbLegacyPostinstall.code !== 0) throw new Error(`selftest: legacy codex-lb postinstall restore exited ${codexLbLegacyPostinstall.code}: ${codexLbLegacyPostinstall.stderr}`);
  const codexLbLegacyPostinstallEnv = await safeReadText(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'));
  const codexLbLegacyPostinstallAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbLoginCallsAfterLegacyPostinstall = await codexLbLoginCallCount(codexLbHome);
  if (!String(codexLbLegacyPostinstall.stdout || '').includes('codex-lb auth: restored from existing Codex login cache') || !codexLbLegacyPostinstallEnv.includes("CODEX_LB_API_KEY='sk-legacy'") || !codexLbLegacyPostinstallEnv.includes("CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'") || !codexLbLegacyPostinstallAuth.includes('"auth_mode":"apikey"') || !codexLbLegacyPostinstallAuth.includes('sk-legacy') || codexLbLoginCallsAfterLegacyPostinstall !== codexLbLoginCallsBeforeLegacyPostinstall) throw new Error('selftest: legacy codex-lb postinstall restore');
  await fsp.rm(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), { force: true });
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model_provider = "codex-lb"\n\n[model_providers.codex-lb]\nname = "openai"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nsupports_websockets = true\nrequires_openai_auth = true\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-legacy-doctor"}\n');
  const codexLbLegacyDoctorProject = tmpdir();
  await ensureDir(path.join(codexLbLegacyDoctorProject, '.git'));
  await writeTextAtomic(path.join(codexLbLegacyDoctorProject, 'package.json'), '{"name":"codex-lb-legacy-doctor-project","version":"0.0.0"}\n');
  const codexLbLegacyDoctorRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'doctor', '--fix', '--json'], {
    cwd: codexLbLegacyDoctorProject,
    env: { ...codexLbEnvForSelftest, SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-legacy-doctor-global'), SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 30000,
    maxOutputBytes: 256 * 1024
  });
  if (codexLbLegacyDoctorRepair.code !== 0) throw new Error(`selftest: legacy doctor --fix codex-lb restore exited ${codexLbLegacyDoctorRepair.code}: ${codexLbLegacyDoctorRepair.stderr}`);
  const codexLbLegacyDoctorJson = JSON.parse(codexLbLegacyDoctorRepair.stdout);
  const codexLbLegacyDoctorEnv = await safeReadText(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'));
  const codexLbLegacyDoctorConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  const codexLbLegacyDoctorAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (!codexLbLegacyDoctorJson.repair?.codex_lb?.ok || !codexLbLegacyDoctorJson.repair.codex_lb.legacy_auth_migrated || !codexLbLegacyDoctorEnv.includes("CODEX_LB_API_KEY='sk-legacy-doctor'") || !codexLbLegacyDoctorAuth.includes('"auth_mode":"apikey"') || !codexLbLegacyDoctorAuth.includes('sk-legacy-doctor') || !hasTopLevelCodexLbSelected(codexLbLegacyDoctorConfig) || !codexLbLegacyDoctorConfig.includes('env_key = "CODEX_LB_API_KEY"')) throw new Error('selftest: legacy doctor codex-lb restore');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\n");
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `model = "${REQUIRED_CODEX_MODEL}"\nservice_tier = "fast"\n`);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-env-only"}\n');
  const codexLbLoginCallsBeforeEnvOnlyPostinstall = await codexLbLoginCallCount(codexLbHome);
  const codexLbEnvOnlyPostinstall = await runProcess(process.execPath, [packagedSksEntrypoint(), 'postinstall'], {
    cwd: tmp,
    env: codexLbPostinstallEnv(codexLbEnvForSelftest),
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  if (codexLbEnvOnlyPostinstall.code !== 0) throw new Error(`selftest: env-only codex-lb postinstall restore exited ${codexLbEnvOnlyPostinstall.code}: ${codexLbEnvOnlyPostinstall.stderr}`);
  const codexLbEnvOnlyPostinstallEnv = await safeReadText(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'));
  const codexLbEnvOnlyPostinstallConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  const codexLbEnvOnlyPostinstallAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbLoginCallsAfterEnvOnlyPostinstall = await codexLbLoginCallCount(codexLbHome);
  if (!String(codexLbEnvOnlyPostinstall.stdout || '').includes('codex-lb auth: restored from existing Codex login cache') || !codexLbEnvOnlyPostinstallEnv.includes("CODEX_LB_API_KEY='sk-env-only'") || !codexLbEnvOnlyPostinstallConfig.includes('env_key = "CODEX_LB_API_KEY"') || !hasTopLevelCodexLbSelected(codexLbEnvOnlyPostinstallConfig) || !codexLbEnvOnlyPostinstallAuth.includes('sk-env-only') || codexLbLoginCallsAfterEnvOnlyPostinstall !== codexLbLoginCallsBeforeEnvOnlyPostinstall) throw new Error('selftest: env-only codex-lb postinstall restore');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\n");
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `model = "${REQUIRED_CODEX_MODEL}"\nservice_tier = "fast"\n`);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-env-only-doctor"}\n');
  const codexLbEnvOnlyDoctorProject = tmpdir();
  await ensureDir(path.join(codexLbEnvOnlyDoctorProject, '.git'));
  await writeTextAtomic(path.join(codexLbEnvOnlyDoctorProject, 'package.json'), '{"name":"codex-lb-env-only-doctor-project","version":"0.0.0"}\n');
  const codexLbEnvOnlyDoctorRepair = await runProcess(process.execPath, [packagedSksEntrypoint(), 'doctor', '--fix', '--json'], {
    cwd: codexLbEnvOnlyDoctorProject,
    env: { ...codexLbEnvForSelftest, SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-env-only-doctor-global'), SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 30000,
    maxOutputBytes: 256 * 1024
  });
  if (codexLbEnvOnlyDoctorRepair.code !== 0) throw new Error(`selftest: env-only doctor --fix codex-lb restore exited ${codexLbEnvOnlyDoctorRepair.code}: ${codexLbEnvOnlyDoctorRepair.stderr}`);
  const codexLbEnvOnlyDoctorJson = JSON.parse(codexLbEnvOnlyDoctorRepair.stdout);
  const codexLbEnvOnlyDoctorEnv = await safeReadText(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'));
  const codexLbEnvOnlyDoctorConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  const codexLbEnvOnlyDoctorAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (!codexLbEnvOnlyDoctorJson.repair?.codex_lb?.ok || !codexLbEnvOnlyDoctorJson.repair.codex_lb.legacy_auth_migrated || !codexLbEnvOnlyDoctorEnv.includes("CODEX_LB_API_KEY='sk-env-only-doctor'") || !codexLbEnvOnlyDoctorConfig.includes('env_key = "CODEX_LB_API_KEY"') || !hasTopLevelCodexLbSelected(codexLbEnvOnlyDoctorConfig) || !codexLbEnvOnlyDoctorAuth.includes('sk-env-only-doctor')) throw new Error('selftest: env-only doctor codex-lb restore');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_API_KEY='sk-test'\n");
  const codexLbMissingCli = await runProcess(process.execPath, [packagedSksEntrypoint(), 'postinstall'], {
    cwd: tmp,
    env: {
      HOME: codexLbHome,
      SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-missing-cli-global'),
      PATH: '',
      SKS_POSTINSTALL_NO_BOOTSTRAP: '1',
      SKS_SKIP_POSTINSTALL_SHIM: '1',
      SKS_SKIP_POSTINSTALL_CONTEXT7: '1',
      SKS_SKIP_POSTINSTALL_GETDESIGN: '1',
      SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1',
      SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH: '0',
      SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1'
    },
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  if (codexLbMissingCli.code !== 0 || !String(codexLbMissingCli.stdout || '').includes('codex-lb auth: preserved') || String(codexLbMissingCli.stdout || '').includes('codex_missing')) throw new Error('selftest: codex-lb provider auth should not require Codex CLI login');
  const codexLbNotConfiguredHome = path.join(tmp, 'codex-lb-not-configured-home');
  const codexLbNotConfigured = await runProcess(process.execPath, [packagedSksEntrypoint(), 'postinstall'], {
    cwd: tmp,
    env: {
      HOME: codexLbNotConfiguredHome,
      SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-not-configured-global'),
      PATH: '',
      SKS_POSTINSTALL_NO_BOOTSTRAP: '1',
      SKS_SKIP_POSTINSTALL_SHIM: '1',
      SKS_SKIP_POSTINSTALL_CONTEXT7: '1',
      SKS_SKIP_POSTINSTALL_GETDESIGN: '1',
      SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1',
      SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH: '0'
    },
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  if (codexLbNotConfigured.code !== 0 || String(codexLbNotConfigured.stdout || '').includes('codex-lb auth:')) throw new Error('selftest: postinstall should stay quiet when codex-lb is not configured');
  const codexLbStatusText = await runProcess(process.execPath, [packagedSksEntrypoint(), 'codex-lb', 'status'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (!String(codexLbStatusText.stdout || '').includes('Codex App auth:') || !String(codexLbStatusText.stdout || '').includes('sks codex-lb repair')) throw new Error('selftest: codex-lb status did not advertise App auth state and repair command');
  const nonInteractiveLaunchChainCalls: any[] = [];
  const nonInteractiveLaunch = await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (url: any, init: any) => {
      nonInteractiveLaunchChainCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: nonInteractiveLaunchChainCalls.length === 1 ? 'resp_noninteractive_1' : 'resp_noninteractive_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  if (!nonInteractiveLaunch.ok || nonInteractiveLaunch.status !== 'present' || nonInteractiveLaunch.chain_health?.status !== 'chain_ok' || nonInteractiveLaunchChainCalls.length !== 2 || nonInteractiveLaunchChainCalls[1].body.previous_response_id !== 'resp_noninteractive_1') throw new Error('selftest: non-interactive codex-lb launch path did not run response-chain preflight');
  const nonInteractiveBrokenLaunch = (await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_noninteractive_broken' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'previous_response_not_found', message: 'Previous response not found.', param: 'previous_response_id' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  })) as ConfigureCodexLbResult;
  if (nonInteractiveBrokenLaunch.status !== 'present' || nonInteractiveBrokenLaunch.bypass_codex_lb === true || nonInteractiveBrokenLaunch.chain_health?.status !== 'previous_response_not_found') throw new Error('selftest: previous_response_not_found should keep codex-lb active (stateless LB is normal), not silently bypass to ChatGPT OAuth');
  // Hard chain failure (e.g. 500) in non-interactive context should still keep codex-lb by default — the user explicitly configured it, so don't silently swap providers.
  const hardBrokenLaunchCalls: any[] = [];
  const hardBrokenLaunch = (await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (_url: any, init: any) => {
      hardBrokenLaunchCalls.push({ body: JSON.parse(init.body) });
      if (!hardBrokenLaunchCalls[hardBrokenLaunchCalls.length - 1].body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_hardbroken_first' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: { type: 'server_error', code: 'internal_error', message: 'simulated upstream failure' } }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  })) as ConfigureCodexLbResult;
  if (hardBrokenLaunch.status !== 'present' || hardBrokenLaunch.bypass_codex_lb === true || hardBrokenLaunch.chain_health?.status !== 'second_request_failed') throw new Error('selftest: hard codex-lb chain failure in non-interactive launch should default to keeping codex-lb active, not silently bypass');
  // SKS_CODEX_LB_AUTOBYPASS=1 restores the old silent-bypass behavior for CI/automation.
  process.env.SKS_CODEX_LB_AUTOBYPASS = '1';
  let autobypassLaunch: ConfigureCodexLbResult;
  try {
    autobypassLaunch = (await maybePromptCodexLbSetupForLaunch([], {
      home: codexLbHome,
      apiKey: 'sk-test',
      codexBin: path.join(codexLbFakeBin, 'codex'),
      syncLaunchEnv: false,
      timeoutMs: 1000,
      fetch: async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_autobypass_first' }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ error: { type: 'server_error', code: 'internal_error', message: 'simulated upstream failure' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    })) as ConfigureCodexLbResult;
  } finally {
    delete process.env.SKS_CODEX_LB_AUTOBYPASS;
  }
  if (autobypassLaunch.status !== 'chain_unhealthy' || autobypassLaunch.bypass_codex_lb !== true || autobypassLaunch.chain_health?.status !== 'second_request_failed') throw new Error('selftest: SKS_CODEX_LB_AUTOBYPASS=1 should bypass codex-lb on hard chain failure');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `model = "${REQUIRED_CODEX_MODEL}"\nservice_tier = "fast"\n`);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n");
  const missingProviderLaunchCalls: any[] = [];
  const missingProviderLaunch = await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (url: any, init: any) => {
      missingProviderLaunchCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: missingProviderLaunchCalls.length === 1 ? 'resp_missing_provider_1' : 'resp_missing_provider_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const missingProviderRepairedConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (!missingProviderLaunch.ok || missingProviderLaunch.status !== 'present' || missingProviderLaunch.chain_health?.status !== 'chain_ok' || missingProviderLaunchCalls.length !== 2 || !hasTopLevelCodexLbSelected(missingProviderRepairedConfig) || !missingProviderRepairedConfig.includes('[model_providers.codex-lb]') || !missingProviderRepairedConfig.includes('env_key = "CODEX_LB_API_KEY"') || !missingProviderRepairedConfig.includes('supports_websockets = true') || !missingProviderRepairedConfig.includes('requires_openai_auth = true') || !missingProviderRepairedConfig.includes('name = "openai"')) throw new Error('selftest: bare sks launch did not restore codex-lb provider block to current App contract');
  const chainCalls: any[] = [];
  const okChain = await checkCodexLbResponseChain(
    { base_url: 'https://lb.example.test/backend-api/codex', env_path: path.join(codexLbHome, '.codex', 'sks-codex-lb.env') },
    {
      apiKey: 'sk-test',
      timeoutMs: 1000,
      fetch: async (url: any, init: any) => {
        chainCalls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ id: chainCalls.length === 1 ? 'resp_selftest_1' : 'resp_selftest_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
  );
  if (!okChain.ok || okChain.status !== 'chain_ok' || chainCalls.length !== 2 || !String(chainCalls[0].url).endsWith('/backend-api/codex/responses') || chainCalls[1].body.previous_response_id !== 'resp_selftest_1') throw new Error('selftest: codex-lb response chain health check did not verify previous_response_id continuity');
  const previousGlobalFetch = globalThis.fetch;
  const cacheCalls: any[] = [];
  const cachePath = path.join(codexLbHome, '.codex', 'chain-cache-selftest.json');
  try {
    globalThis.fetch = async (url: any, init: any) => {
      cacheCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: cacheCalls.length === 1 ? 'resp_cache_1' : 'resp_cache_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const cacheStatus = { base_url: 'https://cache.example.test/backend-api/codex', env_path: path.join(codexLbHome, '.codex', 'sks-codex-lb.env') };
    const firstCache = await checkCodexLbResponseChain(cacheStatus, { home: codexLbHome, apiKey: 'sk-test', timeoutMs: 1000, cachePath, now: () => 1000 });
    const secondCache = await checkCodexLbResponseChain(cacheStatus, { home: codexLbHome, apiKey: 'sk-test', timeoutMs: 1000, cachePath, now: () => 2000 });
    if (!firstCache.ok || firstCache.status !== 'chain_ok' || secondCache.cached !== true || secondCache.status !== 'chain_ok' || cacheCalls.length !== 2) throw new Error('selftest: codex-lb response chain cache did not avoid repeated launch preflight calls');
  } finally {
    globalThis.fetch = previousGlobalFetch;
  }
  const brokenChain = await checkCodexLbResponseChain(
    { base_url: 'https://lb.example.test/backend-api/codex', env_path: path.join(codexLbHome, '.codex', 'sks-codex-lb.env') },
    {
      apiKey: 'sk-test',
      timeoutMs: 1000,
      fetch: async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_missing_selftest' }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'previous_response_not_found', message: 'Previous response not found.', param: 'previous_response_id' } }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
    }
  );
  if (brokenChain.ok || brokenChain.status !== 'previous_response_not_found' || brokenChain.chain_unhealthy !== true) throw new Error('selftest: codex-lb response chain health check did not detect previous_response_not_found');
  if (!codexLbConfig.includes('hooks = true') || hasDeprecatedCodexHooksFeatureFlag(codexLbConfig) || !codexLbConfig.includes('remote_control = true') || !codexLbConfig.includes('multi_agent = true') || !codexLbConfig.includes('fast_mode = true') || !codexLbConfig.includes('fast_mode_ui = true') || !codexLbConfig.includes('codex_git_commit = true') || !codexLbConfig.includes('computer_use = true') || !codexLbConfig.includes('browser_use = true') || !codexLbConfig.includes('browser_use_external = true') || !codexLbConfig.includes('guardian_approval = true') || !codexLbConfig.includes('tool_suggest = true') || !codexLbConfig.includes('apps = true') || !codexLbConfig.includes('plugins = true') || !codexLbConfig.includes('[plugins."latex@openai-bundled"]') || !codexLbConfig.includes('[plugins."documents@openai-primary-runtime"]') || !codexLbConfig.includes('[user.fast_mode]') || !codexLbConfig.includes('visible = true') || !codexLbConfig.includes('enabled = true') || !/\[profiles\.custom\][\s\S]*?model_reasoning_effort = "low"/.test(codexLbConfig) || !/\[profiles\.sks-fast-high\][\s\S]*?service_tier = "fast"/.test(codexLbConfig) || codexLbConfig.includes('fast_default_opt_out = true') || hasTopLevelCodexModeLock(codexLbConfig)) throw new Error('selftest: codex-lb setup did not preserve Codex App feature flags, default plugins, profile-scoped reasoning effort, explicit Fast profile, Codex Git commit generation, or migrate the hooks feature flag');
  if (!hasCodexUnstableFeatureWarningSuppression(codexLbConfig)) throw new Error('selftest: codex-lb setup did not suppress Codex unstable feature warning');
  const codexLbLaunch = `source ${path.join(tmp, '.codex', 'sks-codex-lb.env')} && codex '--model' '${REQUIRED_CODEX_MODEL}'`;
  if (!codexLbLaunch.includes('sks-codex-lb.env')) throw new Error('selftest: Zellij launch command does not source codex-lb env file');
  if (!codexLbLaunch.includes(`'--model' '${REQUIRED_CODEX_MODEL}'`)) throw new Error(`selftest: Zellij launch command without args did not force ${REQUIRED_CODEX_MODEL}`);
  const madLaunchSource = await safeReadText(path.join(packageRoot(), 'src', 'core', 'commands', 'mad-sks-command.js'));
  if (!madLaunchSource.includes('const lb = await deps.maybePromptCodexLbSetupForLaunch(args)') || !madLaunchSource.includes("const launchLb = lb.status === 'present'") || !madLaunchSource.includes('codexLbImmediateLaunchOpts(cleanArgs, launchLb') || !madLaunchSource.includes('bypass_codex_lb') || !madLaunchSource.includes('model_provider="openai"') || !madLaunchSource.includes('codexLbFreshSession: true')) throw new Error('selftest: MAD launch does not sync codex-lb auth and fresh-session launch options');

}

function hasTopLevelCodexModeLock(text: any = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const top = (firstTable === -1 ? lines : lines.slice(0, firstTable)).join('\n');
  return /(^|\n)\s*(?:model|model_reasoning_effort)\s*=/.test(top);
}

function hasDeprecatedCodexHooksFeatureFlag(text: any = '') {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex((line: any) => line.trim() === '[features]');
  if (start === -1) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (/^\s*\[.+\]\s*$/.test(line)) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).some((line: any) => /^\s*codex_hooks\s*=/.test(line));
}

function hasCodexUnstableFeatureWarningSuppression(text: any = '') {
  return /(^|\n)\s*suppress_unstable_features_warning\s*=\s*true\s*(?:#.*)?(?=\n|$)/.test(String(text || ''));
}
