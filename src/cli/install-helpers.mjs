import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureDir, exists, globalSksRoot, packageRoot, readText, runProcess, tmpdir, which, writeTextAtomic } from '../core/fsx.mjs';
import { getCodexInfo } from '../core/codex-adapter.mjs';
import { formatHarnessConflictReport, llmHarnessCleanupPrompt, scanHarnessConflicts } from '../core/harness-conflicts.mjs';
import { initProject, installSkills } from '../core/init.mjs';
import { context7ConfigToml, DOLLAR_SKILL_NAMES, GETDESIGN_REFERENCE, hasContext7ConfigText, RECOMMENDED_SKILLS } from '../core/routes.mjs';
import { codexLaunchCommand, platformTmuxInstallHint, tmuxReadiness } from '../core/tmux-ui.mjs';

const DEFAULT_CODEX_APP_PLUGINS = [
  ['browser', 'openai-bundled'],
  ['chrome', 'openai-bundled'],
  ['computer-use', 'openai-bundled'],
  ['latex', 'openai-bundled'],
  ['documents', 'openai-primary-runtime'],
  ['presentations', 'openai-primary-runtime'],
  ['spreadsheets', 'openai-primary-runtime']
];

export async function postinstall({ bootstrap }) {
  const installRoot = path.resolve(process.env.INIT_CWD || process.cwd());
  const conflictScan = await scanHarnessConflicts(installRoot);
  if (conflictScan.hard_block) {
    await postinstallHarnessConflictNotice(conflictScan);
    return;
  }
  const codexLbConfigSnapshot = await capturePostinstallCodexLbConfigSnapshot();
  console.log('\nSKS installed.');
  const shim = await ensureSksCommandDuringInstall();
  if (shim.status === 'present') console.log(`SKS command: available (${shim.command}).`);
  else if (shim.status === 'created') console.log(`SKS command: shim created at ${shim.command}.`);
  else if (shim.status === 'created_not_on_path') console.log(`SKS command: shim created at ${shim.command}. Add ${path.dirname(shim.command)} to PATH, or run npx -y -p sneakoscope sks.`);
  else if (shim.status === 'skipped') console.log(`SKS command: skipped (${shim.reason}).`);
  else console.log(`SKS command: shim unavailable. Use npx -y -p sneakoscope sks. ${shim.error || ''}`.trim());
  const context7Install = await ensureGlobalContext7DuringInstall();
  if (context7Install.status === 'present') console.log('Context7 MCP: already configured for Codex.');
  else if (context7Install.status === 'installed') console.log('Context7 MCP: configured for Codex.');
  else if (context7Install.status === 'codex_missing') console.log('Context7 MCP: Codex CLI missing. Install @openai/codex or set SKS_CODEX_BIN, then run `sks context7 setup --scope global` or `sks setup` in a project.');
  else if (context7Install.status === 'skipped') console.log(`Context7 MCP: skipped (${context7Install.reason}).`);
  else if (context7Install.status === 'failed') console.log(`Context7 MCP: auto setup failed. Run \`sks context7 setup --scope global\` or \`sks setup\`. ${context7Install.error || ''}`.trim());
  const fastModeRepair = await ensureGlobalCodexFastModeDuringInstall();
  if (fastModeRepair.status === 'updated') console.log(`Codex App Fast mode: restored in ${fastModeRepair.config_path}.`);
  else if (fastModeRepair.status === 'present') console.log('Codex App Fast mode: config already compatible.');
  else if (fastModeRepair.status === 'skipped') console.log(`Codex App Fast mode: skipped (${fastModeRepair.reason}).`);
  else if (fastModeRepair.status === 'failed') console.log(`Codex App Fast mode: auto repair failed. Run \`sks setup\`. ${fastModeRepair.error || ''}`.trim());
  const globalSkills = await ensureGlobalCodexSkillsDuringInstall();
  if (globalSkills.status === 'installed') {
    const removed = globalSkills.removed_stale_generated_skills || [];
    const cleanup = removed.length ? ` Removed stale generated skill shadow(s): ${removed.join(', ')}.` : '';
    console.log(`Codex App global $ skills: installed in ${globalSkills.root} (${globalSkills.installed_count} skills).${cleanup}`);
  }
  else if (globalSkills.status === 'partial') console.log(`Codex App global $ skills: partial in ${globalSkills.root}; missing ${globalSkills.missing_skills.join(', ')}. Run \`sks doctor --fix\`.`);
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
    await restorePostinstallCodexLbConfigSnapshot(codexLbConfigSnapshot);
    await reportPostinstallCodexLbAuth();
    return;
  }
  await restorePostinstallCodexLbConfigSnapshot(codexLbConfigSnapshot);
  await reportPostinstallCodexLbAuth();
  console.log('\nNext:');
  console.log('  sks bootstrap');
  console.log(`\nSKS bootstrap was not run automatically: ${bootstrapDecision.reason}.`);
  console.log('This initializes the current project, installs SKS Codex App skills, verifies Codex App/Context7 readiness, and checks tmux/runtime dependencies.');
  console.log('Dependency repair: sks deps check; sks deps install tmux');
  console.log('Open runtime after readiness is green: sks\n');
}

async function reportPostinstallCodexLbAuth() {
  const codexLbAuth = await ensureCodexLbAuthDuringInstall();
  if (codexLbAuth.legacy_auth_migrated) console.log(`codex-lb auth: restored from existing Codex login cache into ${codexLbAuth.env_path}.`);
  else if (codexLbAuth.status === 'synced' || codexLbAuth.status === 'present' || codexLbAuth.status === 'repaired') console.log(`codex-lb auth: preserved from ${codexLbAuth.env_path}.`);
  else if (codexLbAuth.status === 'skipped') console.log(`codex-lb auth: skipped (${codexLbAuth.reason}).`);
  else if (codexLbAuth.status === 'missing_env_key') console.log('codex-lb auth: stored key missing. Run `sks codex-lb setup --host <domain> --api-key <key>` to repair.');
  else if (codexLbAuth.status === 'missing_base_url') console.log('codex-lb auth: stored key has no recoverable base URL. Run `sks codex-lb reconfigure --host <domain> --api-key <key>` once.');
  else if (codexLbAuth.status && codexLbAuth.status !== 'not_configured') console.log(`codex-lb auth: repair skipped (${codexLbAuth.status}${codexLbAuth.error ? `: ${codexLbAuth.error}` : ''}).`);
  const reconcile = codexLbAuth.auth_reconcile;
  if (reconcile?.status === 'oauth_preserved') {
    console.log(`codex-lb auth: ChatGPT OAuth preserved for Codex App; codex-lb key stays in env_key (OAuth backup at ${reconcile.backup_path}).`);
  } else if (reconcile?.status === 'oauth_restored') {
    console.log(`codex-lb auth: restored ChatGPT OAuth from ${reconcile.backup_path} while keeping codex-lb selected.`);
  } else if (reconcile?.status === 'apikey_forced') {
    console.log(`codex-lb auth: forced API-key auth.json for CLI-only use (OAuth backup at ${reconcile.backup_path}).`);
  } else if (reconcile?.status === 'backup_only') {
    console.log(`codex-lb auth: detected ChatGPT OAuth tokens in auth.json. OAuth backup written to ${reconcile.backup_path}; auth.json left untouched because SKS_CODEX_LB_NO_AUTH_RECONCILE=1.`);
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

async function postinstallHarnessConflictNotice(conflictScan) {
  console.log('\nSneakoscope Codex package installed, but SKS setup is blocked.');
  console.log(formatHarnessConflictReport(conflictScan, { includePrompt: false }));
  console.log('\nWhat this means: npm can finish installing the package, but `sks setup` and `sks doctor --fix` will refuse to activate SKS until the conflicting harness is removed with human approval.');
  console.log('No files were removed by postinstall.');
  console.log('Cleanup requires a human-approved Codex App session. Recommended model: GPT-5.5, reasoning: high.');
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

export async function postinstallBootstrapDecision(root) {
  if (process.env.SKS_POSTINSTALL_NO_BOOTSTRAP === '1') return { run: false, reason: 'SKS_POSTINSTALL_NO_BOOTSTRAP=1' };
  if (process.env.SKS_POSTINSTALL_BOOTSTRAP === '0') return { run: false, reason: 'SKS_POSTINSTALL_BOOTSTRAP=0' };
  const installRoot = path.resolve(root || process.cwd());
  const candidate = await isProjectSetupCandidate(installRoot);
  const target = candidate ? installRoot : globalSksRoot();
  if (process.env.SKS_POSTINSTALL_BOOTSTRAP === '1') return { run: true, target, reason: 'forced by SKS_POSTINSTALL_BOOTSTRAP=1' };
  if (candidate) return { run: true, target, reason: 'auto-running sks setup --bootstrap --install-scope global --force' };
  return { run: true, target, reason: 'no project marker found; auto-running global SKS runtime bootstrap' };
}

async function runPostinstallBootstrap(root, bootstrap) {
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

export async function askPostinstallQuestion(question) {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export function codexLbConfigPath(home = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'config.toml');
}

export function codexLbEnvPath(home = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'sks-codex-lb.env');
}

function codexAuthPath(home = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'auth.json');
}

function codexAuthChatgptBackupPath(home = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'auth.chatgpt-backup.json');
}

async function capturePostinstallCodexLbConfigSnapshot(home = process.env.HOME || os.homedir()) {
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
    auth_existed: authExisted,
    auth_text: authText
  };
}

async function restorePostinstallCodexLbConfigSnapshot(snapshot) {
  if (!snapshot) return { status: 'skipped', reason: 'no_snapshot' };
  let configRestored = false;
  if (snapshot.base_url) {
    const current = await readText(snapshot.config_path, '');
    const next = normalizeCodexFastModeUiConfig(upsertCodexLbConfig(current, snapshot.base_url));
    const alreadyOk = next === ensureTrailingNewline(current) && codexLbProviderBaseUrl(current);
    if (!alreadyOk) {
      await writeTextAtomic(snapshot.config_path, next);
      configRestored = true;
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

export function normalizeCodexLbBaseUrl(input = '') {
  let host = String(input || '').trim();
  if (!host) host = 'http://127.0.0.1:2455';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) host = `https://${host}`;
  host = host.replace(/\/+$/, '');
  return /\/backend-api\/codex$/i.test(host) ? host : `${host}/backend-api/codex`;
}

export async function configureCodexLb(opts = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  const envPath = opts.envPath || codexLbEnvPath(home);
  const baseUrl = normalizeCodexLbBaseUrl(opts.host || opts.baseUrl);
  const apiKey = String(opts.apiKey || '').trim();
  if (!apiKey) return { ok: false, status: 'missing_api_key', config_path: configPath, env_path: envPath };
  await ensureDir(path.dirname(configPath));
  const current = await readText(configPath, '');
  const next = normalizeCodexFastModeUiConfig(upsertCodexLbConfig(current, baseUrl));
  await writeTextAtomic(configPath, next);
  await writeTextAtomic(envPath, `export CODEX_LB_BASE_URL=${shellSingleQuote(baseUrl)}\nexport CODEX_LB_API_KEY=${shellSingleQuote(apiKey)}\n`);
  await fsp.chmod(envPath, 0o600).catch(() => {});
  const codexEnvironment = await syncCodexLbProviderEnvironment({ env_path: envPath, base_url: baseUrl }, { ...opts, home });
  const codexLogin = await maybeSyncCodexLbSharedLogin(apiKey, { ...opts, home, force: true });
  const codexLb = await codexLbStatus({ ...opts, home, configPath, envPath });
  const authReconcile = await reconcileCodexLbAuthConflict({ ...opts, home, status: codexLb }).catch((err) => ({ status: 'failed', reason: 'exception', error: err.message }));
  const finalCodexLb = await codexLbStatus({ ...opts, home, configPath, envPath });
  const ok = Boolean(codexEnvironment.ok && codexLogin.ok);
  return {
    ok,
    status: ok ? 'configured' : (codexEnvironment.status || codexLogin.status),
    config_path: configPath,
    env_path: envPath,
    base_url: baseUrl,
    env_key: 'CODEX_LB_API_KEY',
    auth_reconcile: authReconcile,
    codex_lb: finalCodexLb,
    codex_environment: codexEnvironment,
    codex_login: codexLogin,
    error: authReconcile.error || codexEnvironment.error || codexLogin.error || null
  };
}

export async function codexLbStatus(opts = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  const envPath = opts.envPath || codexLbEnvPath(home);
  const config = await readText(configPath, '');
  const envExists = await exists(envPath);
  const envText = envExists ? await readText(envPath, '') : '';
  const authPath = opts.authPath || codexAuthPath(home);
  const authText = await readText(authPath, '');
  const authMode = codexAuthModeSummary(authText);
  const envKeyConfigured = Boolean(parseCodexLbEnvKey(envText));
  const providerConfigured = /\[model_providers\.codex-lb\]/.test(config);
  const selected = hasTopLevelCodexLbSelected(config);
  const baseUrl = codexLbProviderBaseUrl(config) || parseCodexLbEnvBaseUrl(envText) || null;
  const providerRequiresOpenAiAuth = codexLbProviderRequiresOpenAiAuth(config);
  return {
    ok: providerConfigured && envKeyConfigured && Boolean(baseUrl) && providerRequiresOpenAiAuth,
    config_path: configPath,
    env_path: envPath,
    provider_configured: providerConfigured,
    provider_requires_openai_auth: providerRequiresOpenAiAuth,
    selected,
    env_file: envExists,
    env_key_configured: envKeyConfigured,
    env_base_url_configured: Boolean(parseCodexLbEnvBaseUrl(envText)),
    base_url: baseUrl,
    auth_path: authPath,
    auth_mode: authMode.mode,
    auth_usable_for_codex_app: authMode.codex_app_usable,
    auth_summary: authMode.summary
  };
}

export function formatCodexLbStatusText(status = {}, opts = {}) {
  const backupPresent = Boolean(opts.backupPresent);
  const backupPath = opts.backupPath || '';
  const lines = [
    'SKS codex-lb',
    '',
    `Configured: ${status.ok ? 'yes' : 'no'}`,
    `Selected:   ${status.selected ? 'yes' : 'no'}`,
    `Provider:   ${status.provider_configured ? 'yes' : 'no'}`,
    `Provider requires OpenAI auth: ${status.provider_requires_openai_auth ? 'yes' : 'missing'}`,
    `Codex App auth: ${status.auth_usable_for_codex_app ? 'ok' : 'needs sign-in/repair'} (${status.auth_mode || 'unknown'})`
  ];
  if (status.auth_summary) lines.push(`Auth detail: ${status.auth_summary}`);
  lines.push(`Env file:   ${status.env_file ? status.env_path : 'missing'}`);
  if (status.base_url) lines.push(`Base URL:   ${status.base_url}`);
  lines.push(`ChatGPT backup: ${backupPresent ? `yes (${backupPath})` : 'no'}`);
  if (status.ok && !status.auth_usable_for_codex_app && backupPresent) lines.push('', 'Run: sks codex-lb repair to restore the ChatGPT OAuth backup while keeping codex-lb selected.');
  else if (status.ok && !status.auth_usable_for_codex_app) lines.push('', 'Sign in to Codex App/CLI again, then run: sks codex-lb repair');
  else if (status.ok && !status.selected) lines.push('', 'Run: sks codex-lb repair to activate codex-lb for Codex App.');
  else if (!status.ok && status.base_url && status.env_key_configured) lines.push('', 'Run: sks codex-lb repair to restore the upstream codex-lb provider block.');
  else if (!status.ok) lines.push('', 'Run: sks codex-lb setup --host <domain> --api-key <key>');
  else lines.push('', 'Repair provider auth: sks codex-lb repair');
  if (backupPresent) lines.push('Switch fully away from codex-lb: sks codex-lb release');
  return `${lines.join('\n')}\n`;
}

export function formatCodexLbRepairResultText(result = {}) {
  const lines = [
    'codex-lb provider auth repaired for Codex CLI/App environment.',
    `Config: ${result.config_path}`,
    `Key env: ${result.env_path}`
  ];
  if (result.auth_reconcile?.status === 'oauth_restored') lines.push(`Codex App auth: ChatGPT OAuth restored from ${result.auth_reconcile.backup_path}.`);
  else if (result.auth_reconcile?.status === 'oauth_preserved') lines.push('Codex App auth: ChatGPT OAuth preserved; codex-lb will use CODEX_LB_API_KEY from env_key.');
  else if (result.auth_reconcile?.status === 'apikey_auth_active') lines.push('Codex App auth: API-key auth.json is still active. Sign in again if the App asks for ChatGPT OAuth.');
  return `${lines.join('\n')}\n`;
}

function codexLbResponsesEndpoint(baseUrl = '') {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return /\/responses$/i.test(base) ? base : `${base}/responses`;
}

function codexLbChainCheckEnabled(env = process.env) {
  return env.SKS_CODEX_LB_CHAIN_CHECK !== '0' && env.SKS_SKIP_CODEX_LB_CHAIN_CHECK !== '1';
}

function codexLbChainCachePath(home = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'sks-codex-lb-chain-health.json');
}

function codexLbChainCacheTtlMs(status = '', env = process.env) {
  const hardFailure = Boolean(status && !['chain_ok', 'previous_response_not_found'].includes(status));
  const key = hardFailure ? 'SKS_CODEX_LB_CHAIN_CHECK_FAILURE_CACHE_TTL_MS' : 'SKS_CODEX_LB_CHAIN_CHECK_CACHE_TTL_MS';
  const fallback = hardFailure ? 30 * 1000 : 5 * 60 * 1000;
  const raw = env[key] ?? env.SKS_CODEX_LB_CHAIN_CHECK_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function codexLbChainCacheEnabled(opts = {}, env = process.env) {
  if (opts.force || opts.cache === false) return false;
  if (opts.fetch) return false;
  if (env.SKS_CODEX_LB_CHAIN_CHECK_CACHE === '0') return false;
  return true;
}

async function readCodexLbChainCache({ endpoint, home, opts = {}, env = process.env } = {}) {
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

async function writeCodexLbChainCache(result = {}, { endpoint, home, opts = {}, env = process.env } = {}) {
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

function isPreviousResponseNotFound(payload = {}) {
  const error = payload?.error || payload?.response?.error || payload;
  const text = typeof error === 'string'
    ? error
    : [error?.type, error?.code, error?.message, error?.param, JSON.stringify(error || {})].filter(Boolean).join(' ');
  return /previous_response_not_found|previous_response_id.*not found|previous_response_id/i.test(text);
}

function parseCodexLbSseEvents(text = '') {
  const events = [];
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

function codexLbResponseId(payload = {}) {
  if (typeof payload?.id === 'string' && payload.id) return payload.id;
  if (typeof payload?.response?.id === 'string' && payload.response.id) return payload.response.id;
  if (typeof payload?.data?.id === 'string' && payload.data.id) return payload.data.id;
  if (typeof payload?.data?.response?.id === 'string' && payload.data.response.id) return payload.data.response.id;
  return null;
}

function codexLbResponseError(json, events = []) {
  if (json?.error) return json;
  for (const event of events) {
    if (event?.error || event?.response?.error || event?.type === 'response.failed' || event?.type === 'error') return event;
  }
  return null;
}

async function fetchCodexLbResponse(fetchImpl, endpoint, apiKey, body, timeoutMs) {
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
    const responseId = codexLbResponseId(json) || events.map((event) => codexLbResponseId(event)).find(Boolean) || null;
    const errorPayload = codexLbResponseError(json, events);
    return { ok: response.ok && !errorPayload, status: response.status, json, text, events, response_id: responseId, error_payload: errorPayload };
  } catch (err) {
    return { ok: false, status: 0, json: null, text: err.name === 'AbortError' ? 'request timed out' : err.message, events: [], response_id: null, error_payload: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkCodexLbResponseChain(status = {}, opts = {}) {
  const env = opts.env || process.env;
  if (!codexLbChainCheckEnabled(env) && !opts.force) return { ok: true, status: 'skipped', skipped: true, reason: 'SKS_CODEX_LB_CHAIN_CHECK=0' };
  const endpoint = codexLbResponsesEndpoint(opts.baseUrl || status.base_url);
  if (!endpoint) return { ok: false, status: 'missing_base_url', chain_unhealthy: true };
  const home = opts.home || env.HOME || os.homedir();
  const apiKey = opts.apiKey || parseCodexLbEnvKey(await readText(opts.envPath || status.env_path || codexLbEnvPath(home), ''));
  if (!apiKey) return { ok: false, status: 'missing_env_key', chain_unhealthy: true };
  const cached = await readCodexLbChainCache({ endpoint, home, opts, env });
  if (cached) return cached;
  const fetchImpl = opts.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { ok: true, status: 'skipped', skipped: true, reason: 'fetch unavailable' };
  const model = opts.model || env.SKS_CODEX_MODEL || 'gpt-5.5';
  const timeoutMs = Number(opts.timeoutMs || env.SKS_CODEX_LB_CHAIN_CHECK_TIMEOUT_MS || 8000);
  const baseBody = {
    model,
    instructions: 'You are running a short SKS codex-lb response-chain health check.',
    input: 'SKS codex-lb response-chain health check. Reply with OK.',
    stream: true,
    store: true,
    parallel_tool_calls: false,
    tool_choice: 'auto',
    reasoning: { effort: 'low' }
  };
  const first = await fetchCodexLbResponse(fetchImpl, endpoint, apiKey, baseBody, timeoutMs);
  if (!first.ok || !first.response_id) {
    return writeCodexLbChainCache({
      ok: false,
      status: first.ok ? 'missing_response_id' : 'first_request_failed',
      chain_unhealthy: true,
      endpoint,
      http_status: first.status,
      error: redactSecretText(first.error_payload?.error?.message || first.error_payload?.response?.error?.message || first.text || 'codex-lb first Responses request failed', [apiKey])
    }, { endpoint, home, opts, env });
  }
  const second = await fetchCodexLbResponse(fetchImpl, endpoint, apiKey, { ...baseBody, previous_response_id: first.response_id }, timeoutMs);
  if (second.ok) return writeCodexLbChainCache({ ok: true, status: 'chain_ok', endpoint, response_id: first.response_id, chained_response_id: second.response_id || null, http_status: second.status }, { endpoint, home, opts, env });
  const previousMissing = isPreviousResponseNotFound(second.error_payload || second.json || second.text);
  return writeCodexLbChainCache({
    ok: false,
    status: previousMissing ? 'previous_response_not_found' : 'second_request_failed',
    chain_unhealthy: true,
    endpoint,
    response_id: first.response_id,
    http_status: second.status,
    error: redactSecretText(second.error_payload?.error?.message || second.error_payload?.response?.error?.message || second.text || 'codex-lb chained Responses request failed', [apiKey])
  }, { endpoint, home, opts, env });
}

function hasTopLevelCodexLbSelected(text = '') {
  const topLevel = String(text || '').split(/\n\s*\[/)[0] || '';
  return /(^|\n)\s*model_provider\s*=\s*"codex-lb"\s*(?:#.*)?(?=\n|$)/.test(topLevel);
}

function codexLbProviderBaseUrl(text = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return block.match(/(^|\n)\s*base_url\s*=\s*"([^"]+)"/)?.[2] || '';
}

function codexLbProviderRequiresOpenAiAuth(text = '') {
  const block = String(text || '').match(/(^|\n)\[model_providers\.codex-lb\]([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/)?.[2] || '';
  return /(^|\n)\s*requires_openai_auth\s*=\s*true\s*(?:#.*)?(?=\n|$)/.test(block);
}

export async function repairCodexLbAuth(opts = {}) {
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
  if (status.env_key_configured && status.base_url && (!status.ok || !status.selected || !status.provider_requires_openai_auth || legacyAuthMigrated || hasTopLevelCodexModeLock(currentConfig))) {
    await ensureDir(path.dirname(status.config_path));
    const next = normalizeCodexFastModeUiConfig(upsertCodexLbConfig(currentConfig, status.base_url));
    await writeTextAtomic(status.config_path, next);
    configRepaired = true;
    status = await codexLbStatus(opts);
  }
  if (!status.ok) {
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
  const codexLogin = await maybeSyncCodexLbSharedLogin(apiKey, { ...opts, home: opts.home || process.env.HOME || os.homedir(), force: true });
  const authReconcile = await reconcileCodexLbAuthConflict({ ...opts, status }).catch((err) => ({ status: 'failed', reason: 'exception', error: err.message }));
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

export async function ensureCodexLbAuthDuringInstall(opts = {}) {
  if (process.env.SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH=1' };
  const status = await codexLbStatus(opts);
  if (!status.selected && !status.provider_configured && !status.env_file) return { status: 'not_configured', codex_lb: status };
  await migrateCodexAuthKeyFormat({ home: opts.home });
  if (status.ok && (!status.selected || !status.provider_requires_openai_auth)) return repairCodexLbAuth(opts);
  if (!status.ok) {
    if (status.base_url && (status.env_key_configured || status.provider_configured || status.selected || status.env_base_url_configured)) return repairCodexLbAuth(opts);
    return { status: status.env_key_configured ? 'missing_base_url' : 'missing_env_key', codex_lb: status, config_path: status.config_path, env_path: status.env_path };
  }
  const codexEnvironment = await syncCodexLbProviderEnvironment(status, opts);
  const apiKey = parseCodexLbEnvKey(await readText(status.env_path, ''));
  const codexLogin = await maybeSyncCodexLbSharedLogin(apiKey, { ...opts, home: opts.home || process.env.HOME || os.homedir(), force: true });
  const authReconcile = await reconcileCodexLbAuthConflict({ ...opts, status }).catch((err) => ({ status: 'failed', reason: 'exception', error: err.message }));
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

async function restoreCodexLbEnvFromSharedLogin(status = {}, opts = {}) {
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
function hasChatgptOAuthTokens(text = '') {
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

function parseCodexAuthApiKey(text = '') {
  try {
    const parsed = JSON.parse(String(text || ''));
    const key = parsed?.key || parsed?.api_key || parsed?.apiKey || parsed?.openai_api_key || parsed?.OPENAI_API_KEY;
    return typeof key === 'string' ? key.trim() : '';
  } catch {
    return '';
  }
}

function codexAuthModeSummary(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return { mode: 'missing', codex_app_usable: false, summary: 'missing auth.json' };
  if (hasChatgptOAuthTokens(raw)) return { mode: 'chatgpt_oauth', codex_app_usable: true, summary: 'ChatGPT OAuth token blob present' };
  const apiKey = parseCodexAuthApiKey(raw);
  if (apiKey) return { mode: 'apikey', codex_app_usable: false, summary: 'API-key auth.json; Codex App may require ChatGPT sign-in for requires_openai_auth providers' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.auth_mode === 'browser') return { mode: 'browser_marker', codex_app_usable: false, summary: 'browser auth marker without refresh tokens' };
  } catch {}
  return { mode: 'unknown', codex_app_usable: false, summary: 'unrecognized auth.json shape' };
}

// Migrate auth.json from legacy {"auth_mode":"apikey","key":"..."} to the codex 0.130.0+
// format {"auth_mode":"apikey","OPENAI_API_KEY":"..."}. Safe: preserves key value, only renames field.
async function migrateCodexAuthKeyFormat(opts = {}) {
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

// Codex App needs a refreshable ChatGPT OAuth blob when a provider declares
// requires_openai_auth=true. For codex-lb, the proxy key belongs in env_key
// (CODEX_LB_API_KEY), so SKS preserves or restores OAuth by default and only
// writes apikey auth.json when explicitly requested for CLI-only legacy use.
export async function reconcileCodexLbAuthConflict(opts = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const status = opts.status || await codexLbStatus({ ...opts, home });
  const authPath = opts.authPath || codexAuthPath(home);
  const backupPath = opts.backupPath || codexAuthChatgptBackupPath(home);
  if (!status.env_key_configured || !status.base_url) {
    return { status: 'skipped', reason: 'codex_lb_not_ready', auth_path: authPath };
  }
  if (!(await exists(authPath))) {
    return { status: 'skipped', reason: 'auth_missing', auth_path: authPath };
  }
  const authText = await readText(authPath, '');
  if (!authText.trim()) {
    return { status: 'skipped', reason: 'auth_empty', auth_path: authPath };
  }
  const envText = await readText(status.env_path, '');
  const apiKey = parseCodexLbEnvKey(envText);
  if (!apiKey) {
    return { status: 'skipped', reason: 'missing_env_key', auth_path: authPath };
  }
  if (hasChatgptOAuthTokens(authText)) {
    try {
      await ensureDir(path.dirname(backupPath));
      await writeTextAtomic(backupPath, authText);
      await fsp.chmod(backupPath, 0o600).catch(() => {});
    } catch (err) {
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
    if (process.env.SKS_CODEX_LB_FORCE_APIKEY_AUTH !== '1') {
      return {
        status: 'oauth_preserved',
        reason: 'codex_app_requires_refreshable_oauth',
        auth_path: authPath,
        backup_path: backupPath
      };
    }
    try {
      const replacement = `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: apiKey }, null, 2)}\n`;
      await writeTextAtomic(authPath, replacement);
      await fsp.chmod(authPath, 0o600).catch(() => {});
    } catch (err) {
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
      } catch (err) {
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
export function codexLbChatgptBackupPath(home = process.env.HOME || os.homedir()) {
  return codexAuthChatgptBackupPath(home);
}

// Remove a top-level TOML key (only above the first table header). Returns the original text
// unchanged when the key isn't present.
function removeTopLevelTomlString(text, key) {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  let removed = false;
  for (let i = end - 1; i >= 0; i--) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i])) {
      lines.splice(i, 1);
      removed = true;
    }
  }
  if (!removed) return text;
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

// Unselect codex-lb at the top-level model_provider setting. Leaves [model_providers.codex-lb]
// and the env file alone so the user can re-engage with `sks codex-lb repair`.
export async function unselectCodexLbProvider(opts = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  const current = await readText(configPath, '');
  if (!current.trim()) return { status: 'not_selected', reason: 'no_config', config_path: configPath };
  if (!hasTopLevelCodexLbSelected(current)) return { status: 'not_selected', config_path: configPath };
  try {
    const next = ensureTrailingNewline(removeTopLevelTomlString(current, 'model_provider'));
    await writeTextAtomic(configPath, next);
    return { status: 'unselected', config_path: configPath };
  } catch (err) {
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
export async function releaseCodexLbAuthHold(opts = {}) {
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
  } catch (err) {
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

export async function maybePromptCodexLbSetupForLaunch(args = [], opts = {}) {
  if (args.includes('--json') || args.includes('--skip-codex-lb') || process.env.SKS_SKIP_CODEX_LB_PROMPT === '1') return { status: 'skipped' };
  let status = await codexLbStatus(opts);
  if (status.env_key_configured && status.base_url && (!status.provider_configured || !status.selected || !status.provider_requires_openai_auth)) {
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

async function syncCodexLbProviderEnvironment(status = {}, opts = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const envPath = opts.envPath || status.env_path || codexLbEnvPath(home);
  const envText = await readText(envPath, '');
  const apiKey = parseCodexLbEnvKey(envText);
  if (!apiKey) return { ok: false, status: 'missing_env_key' };
  const baseUrl = status.base_url || parseCodexLbEnvBaseUrl(envText);
  process.env.CODEX_LB_API_KEY = apiKey;
  if (baseUrl) process.env.CODEX_LB_BASE_URL = baseUrl;
  const launchEnv = await syncCodexLbMacLaunchEnvironment({ CODEX_LB_API_KEY: apiKey, ...(baseUrl ? { CODEX_LB_BASE_URL: baseUrl } : {}) }, opts);
  const ok = launchEnv.ok || launchEnv.skipped || launchEnv.status === 'not_macos';
  return {
    ok,
    status: launchEnv.status === 'synced' ? 'synced' : ok ? 'process_env' : launchEnv.status,
    env_path: envPath,
    base_url: baseUrl || null,
    launch_environment: launchEnv,
    error: launchEnv.error || null
  };
}

async function syncCodexLbMacLaunchEnvironment(values = {}, opts = {}) {
  if (opts.syncLaunchEnv === false || process.env.SKS_SKIP_CODEX_LB_LAUNCH_ENV === '1') return { ok: true, status: 'skipped', skipped: true, reason: 'SKS_SKIP_CODEX_LB_LAUNCH_ENV=1' };
  if (process.platform !== 'darwin' && !opts.forceLaunchEnv) return { ok: true, status: 'not_macos', skipped: true };
  const launchctl = opts.launchctlBin || await which('launchctl').catch(() => null) || await exists('/bin/launchctl').then((ok) => ok ? '/bin/launchctl' : null).catch(() => null);
  if (!launchctl) return { ok: false, status: 'launchctl_missing', error: 'launchctl not found on PATH' };
  const variables = Object.entries(values).filter(([, value]) => value);
  const results = [];
  for (const [key, value] of variables) {
    const result = await runProcess(launchctl, ['setenv', key, value], { timeoutMs: 5000, maxOutputBytes: 8192 });
    results.push({
      key,
      ok: result.code === 0,
      error: result.code === 0 ? null : redactSecretText(result.stderr || result.stdout || 'launchctl setenv failed', [value]).trim()
    });
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length) return { ok: false, status: 'launch_env_failed', variables: results.map((result) => result.key), failed, error: failed.map((result) => `${result.key}: ${result.error}`).join('; ') };
  return { ok: true, status: 'synced', variables: results.map((result) => result.key) };
}

async function maybeSyncCodexLbSharedLogin(apiKey, opts = {}) {
  if (!apiKey) return { ok: false, status: 'missing_env_key' };
  if (!shouldSyncCodexLbSharedLogin(opts)) {
    return { ok: true, status: 'skipped', reason: 'codex-lb uses provider env_key auth; set SKS_CODEX_LB_SYNC_CODEX_LOGIN=1 to also rewrite Codex shared login cache.' };
  }
  return syncCodexApiKeyLogin(apiKey, opts);
}

function shouldSyncCodexLbSharedLogin(opts = {}) {
  return opts.syncCodexLogin === true || process.env.SKS_CODEX_LB_SYNC_CODEX_LOGIN === '1';
}

async function syncCodexApiKeyLogin(apiKey, opts = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const codexHome = opts.codexHome || path.join(home, '.codex');
  const codexBin = opts.codexBin || (await getCodexInfo().catch(() => ({}))).bin || await which('codex').catch(() => null);
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

function upsertCodexLbConfig(text = '', baseUrl) {
  let next = upsertTopLevelTomlString(text, 'model_provider', 'codex-lb');
  const block = [
    '[model_providers.codex-lb]',
    'name = "OpenAI"',
    `base_url = "${baseUrl}"`,
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true'
  ].join('\n');
  next = upsertTomlTable(next, 'model_providers.codex-lb', block);
  return `${next.trim()}\n`;
}

export async function ensureGlobalCodexFastModeDuringInstall(opts = {}) {
  if (process.env.SKS_SKIP_CODEX_FAST_MODE_REPAIR === '1') return { status: 'skipped', reason: 'SKS_SKIP_CODEX_FAST_MODE_REPAIR=1' };
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  try {
    await ensureDir(path.dirname(configPath));
    const current = await readText(configPath, '');
    const next = normalizeCodexFastModeUiConfig(current);
    if (next === ensureTrailingNewline(current)) return { status: 'present', config_path: configPath };
    await writeTextAtomic(configPath, next);
    return { status: 'updated', config_path: configPath };
  } catch (err) {
    return { status: 'failed', config_path: configPath, error: err.message };
  }
}

export function normalizeCodexFastModeUiConfig(text = '') {
  let next = removeLegacyTopLevelCodexModeLocks(text);
  next = removeTomlTableKey(next, 'notice', 'fast_default_opt_out');
  next = removeTomlTableKey(next, 'features', 'codex_hooks');
  next = upsertTopLevelTomlString(next, 'model', 'gpt-5.5');
  next = upsertTopLevelTomlString(next, 'service_tier', 'fast');
  next = upsertTopLevelTomlBoolean(next, 'suppress_unstable_features_warning', true);
  next = upsertTomlTableKey(next, 'features', 'hooks = true');
  next = upsertTomlTableKey(next, 'features', 'remote_control = true');
  next = upsertTomlTableKey(next, 'features', 'multi_agent = true');
  next = upsertTomlTableKey(next, 'features', 'fast_mode = true');
  next = upsertTomlTableKey(next, 'features', 'fast_mode_ui = true');
  next = upsertTomlTableKey(next, 'features', 'codex_git_commit = true');
  next = upsertTomlTableKey(next, 'features', 'computer_use = true');
  next = upsertTomlTableKey(next, 'features', 'browser_use = true');
  next = upsertTomlTableKey(next, 'features', 'browser_use_external = true');
  next = upsertTomlTableKey(next, 'features', 'image_generation = true');
  next = upsertTomlTableKey(next, 'features', 'in_app_browser = true');
  next = upsertTomlTableKey(next, 'features', 'guardian_approval = true');
  next = upsertTomlTableKey(next, 'features', 'tool_suggest = true');
  next = upsertTomlTableKey(next, 'features', 'apps = true');
  next = upsertTomlTableKey(next, 'features', 'plugins = true');
  next = upsertTomlTableKey(next, 'user.fast_mode', 'visible = true');
  next = upsertTomlTableKey(next, 'user.fast_mode', 'enabled = true');
  next = upsertTomlTableKey(next, 'user.fast_mode', 'default_profile = "sks-fast-high"');
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'model = "gpt-5.5"');
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'service_tier = "fast"');
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'approval_policy = "on-request"');
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'sandbox_mode = "workspace-write"');
  next = upsertTomlTableKey(next, 'profiles.sks-fast-high', 'model_reasoning_effort = "high"');
  next = upsertTomlTableKey(next, 'profiles.sks-research-xhigh', 'model = "gpt-5.5"');
  next = upsertTomlTableKey(next, 'profiles.sks-research-xhigh', 'service_tier = "fast"');
  next = upsertTomlTableKey(next, 'profiles.sks-research-xhigh', 'approval_policy = "on-request"');
  next = upsertTomlTableKey(next, 'profiles.sks-research-xhigh', 'sandbox_mode = "workspace-write"');
  next = upsertTomlTableKey(next, 'profiles.sks-research-xhigh', 'model_reasoning_effort = "xhigh"');
  next = upsertTomlTableKey(next, 'profiles.sks-research', 'model = "gpt-5.5"');
  next = upsertTomlTableKey(next, 'profiles.sks-research', 'service_tier = "fast"');
  next = upsertTomlTableKey(next, 'profiles.sks-research', 'approval_policy = "never"');
  next = upsertTomlTableKey(next, 'profiles.sks-research', 'sandbox_mode = "workspace-write"');
  next = upsertTomlTableKey(next, 'profiles.sks-research', 'model_reasoning_effort = "xhigh"');
  for (const [name, marketplace] of DEFAULT_CODEX_APP_PLUGINS) {
    const table = `plugins."${name}@${marketplace}"`;
    next = upsertTomlTable(next, table, `[${table}]\nenabled = true`);
  }
  return ensureTrailingNewline(next);
}

function removeLegacyTopLevelCodexModeLocks(text = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  return lines.filter((line, index) => {
    if (index >= end) return true;
    return !/^\s*model_reasoning_effort\s*=/.test(line);
  }).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function removeTopLevelTomlKeyIfValue(text = '', key = '', value = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"${escapeRegExp(value)}"\\s*(?:#.*)?$`);
  return lines.filter((line, index) => index >= end || !keyPattern.test(line)).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function removeTomlTableKey(text, table, key) {
  const lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') return '';
  const header = `[${table}]`;
  const start = lines.findIndex((x) => x.trim() === header);
  if (start === -1) return String(text || '');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  return lines.filter((line, index) => index <= start || index >= end || !keyPattern.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');
}

function upsertTomlTableKey(text, table, line) {
  const key = String(line).split('=')[0].trim();
  const lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines.length = 0;
  const header = `[${table}]`;
  const start = lines.findIndex((x) => x.trim() === header);
  if (start === -1) return [...lines, ...(lines.length ? [''] : []), header, line].join('\n').replace(/\n{3,}/g, '\n\n');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  for (let i = start + 1; i < end; i++) {
    if (keyRe.test(lines[i])) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function ensureTrailingNewline(text = '') {
  const value = String(text || '').trimEnd();
  return value ? `${value}\n` : '';
}

function upsertTopLevelTomlString(text, key, value) {
  const line = `${key} = "${value}"`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i++) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i])) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function upsertTopLevelTomlBoolean(text, key, value) {
  const line = `${key} = ${value ? 'true' : 'false'}`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i += 1) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i])) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function upsertTomlTable(text, table, block) {
  let lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  const start = lines.findIndex((x) => x.trim() === header);
  const blockLines = String(block || '').trim().split('\n');
  if (start === -1) return [...lines, ...(lines.length ? [''] : []), ...blockLines].join('\n').replace(/\n{3,}/g, '\n\n');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start, ...blockLines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseCodexLbEnvKey(text = '') {
  return parseShellEnvValue(text, 'CODEX_LB_API_KEY');
}

function parseCodexLbEnvBaseUrl(text = '') {
  const value = parseShellEnvValue(text, 'CODEX_LB_BASE_URL');
  return value ? normalizeCodexLbBaseUrl(value) : '';
}

function parseCodexSharedLoginApiKey(text = '') {
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

function parseShellEnvValue(text = '', key = '') {
  const re = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`, 'm');
  const envMatch = String(text || '').match(re);
  const raw = envMatch?.[1]?.trim() || '';
  if (!raw) return '';
  if (raw.startsWith("'")) return raw.endsWith("'") && raw.length > 1 ? raw.slice(1, -1).replace(/'\\''/g, "'") : '';
  if (raw.startsWith('"')) return raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1).replace(/\\"/g, '"') : '';
  if (raw.includes("'") || raw.includes('"') || /\s/.test(raw)) return '';
  return raw;
}

function redactSecretText(text = '', secrets = []) {
  let out = String(text || '');
  for (const secret of secrets) {
    const value = String(secret || '');
    if (!value) continue;
    out = out.split(value).join('[redacted]');
  }
  return out;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function ensureSksCommandDuringInstall(opts = {}) {
  if (process.env.SKS_SKIP_POSTINSTALL_SHIM === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_SHIM=1' };
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? '';
  const existing = await findCommandOnPath('sks', pathEnv);
  if (isStableSksBin(existing)) return { status: 'present', command: existing };
  const nodeBin = opts.nodeBin || process.execPath;
  const target = opts.target || path.join(packageRoot(), 'bin', 'sks.mjs');
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
    } catch (err) {
      lastError = err.message;
    }
  }
  if (createdFallback) return { status: 'created_not_on_path', command: createdFallback };
  return { status: 'failed', error: lastError };
}

function candidateShimDirs(pathEnv, home) {
  const seen = new Set();
  const out = [];
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

async function findCommandOnPath(name, pathEnv) {
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of String(pathEnv || '').split(path.delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, `${name}${suffix}`);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

async function ensureGlobalContext7DuringInstall() {
  if (process.env.SKS_SKIP_POSTINSTALL_CONTEXT7 === '1') return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_CONTEXT7=1' };
  const codex = await getCodexInfo().catch(() => ({}));
  if (!codex.bin) return { status: 'codex_missing' };
  const env = withoutSecretEnv(['CODEX_LB_API_KEY']);
  const list = await runProcess(codex.bin, ['mcp', 'list'], { env, timeoutMs: 8000, maxOutputBytes: 32 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (list.code === 0 && /context7/i.test(`${list.stdout}\n${list.stderr}`)) return { status: 'present' };
  const add = await runProcess(codex.bin, ['mcp', 'add', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp@latest'], { env, timeoutMs: 30000, maxOutputBytes: 64 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (add.code === 0) return { status: 'installed' };
  return { status: 'failed', error: `${add.stderr || add.stdout || 'codex mcp add failed'}`.trim() };
}

function withoutSecretEnv(keys = []) {
  const env = { ...process.env };
  for (const key of keys) env[key] = '';
  return env;
}

export async function ensureGlobalCodexSkillsDuringInstall(opts = {}) {
  if (process.env.SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS=1' };
  const home = opts.home || process.env.HOME || os.homedir();
  if (!home) return { status: 'skipped', reason: 'home directory unavailable' };
  const root = globalCodexSkillsRoot(home);
  try {
    const install = await installSkills(home);
    const skills = await checkRequiredSkills(home, root);
    return {
      status: skills.ok ? 'installed' : 'partial',
      root,
      installed_count: install.installed_skills.length,
      removed_aliases: install.removed_agent_skill_aliases,
      removed_stale_generated_skills: install.removed_stale_generated_skills,
      missing_skills: skills.missing
    };
  } catch (err) {
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
  }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  const out = `${add.stdout || ''}\n${add.stderr || ''}`;
  if (add.code === 0) return { status: /already|exists|present/i.test(out) ? 'present' : 'installed', command: skillsBin };
  if (/already|exists|present/i.test(out)) return { status: 'present', command: skillsBin };
  return { status: 'failed', command: skillsBin, error: out.trim() || 'skills add failed' };
}

export async function ensureRelatedCliTools(args = []) {
  const skip = args.includes('--skip-cli-tools') || process.env.SKS_SKIP_CLI_TOOLS === '1';
  const codex = await ensureCodexCliTool({ skip });
  const tmuxRepair = skip ? { status: 'skipped', reason: 'SKS_SKIP_CLI_TOOLS=1 or --skip-cli-tools' } : await ensureTmuxCliTool(args);
  const tmux = await tmuxReadiness().catch((err) => ({ ok: false, version: null, error: err.message }));
  return {
    codex,
    tmux: {
      ok: Boolean(tmux.ok),
      bin: tmux.bin || null,
      version: tmux.version || null,
      min_version: tmux.min_version || '3.0',
      current_session: Boolean(tmux.current_session),
      repair: tmuxRepair,
      install_hint: tmux.ok ? null : platformTmuxInstallHint(),
      error: tmux.error || null
    }
  };
}

export async function ensureCodexCliTool({ skip = false } = {}) {
  if (skip) return { status: 'skipped', reason: 'SKS_SKIP_CLI_TOOLS=1 or --skip-cli-tools' };
  const before = await getCodexInfo().catch(() => ({}));
  if (before.bin) return { status: 'present', bin: before.bin, version: before.version || null };
  const npmBin = await which('npm');
  if (!npmBin) return { status: 'failed', error: 'npm not found on PATH; install Codex CLI manually with npm i -g @openai/codex@latest.' };
  const install = await runProcess(npmBin, ['i', '-g', '@openai/codex@latest'], {
    timeoutMs: 120000,
    maxOutputBytes: 128 * 1024
  }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) {
    return { status: 'failed', error: `${install.stderr || install.stdout || 'npm i -g @openai/codex@latest failed'}`.trim() };
  }
  const after = await getCodexInfo().catch(() => ({}));
  return {
    status: after.bin ? 'installed' : 'installed_not_on_path',
    bin: after.bin || null,
    version: after.version || null,
    hint: after.bin ? null : 'npm completed, but codex is not on PATH. Restart the shell or set SKS_CODEX_BIN.'
  };
}

export async function ensureTmuxCliTool(args = [], opts = {}) {
  const before = await tmuxReadiness().catch((err) => ({ ok: false, error: err.message }));
  if (before.ok) return { target: 'tmux', status: 'present', bin: before.bin || null, version: before.version || null };
  const command = process.platform === 'darwin' ? 'brew install tmux' : platformTmuxInstallHint();
  if (process.platform !== 'darwin') return { target: 'tmux', status: 'manual_required', command, error: before.error || 'tmux not found' };
  const brew = await which('brew').catch(() => null);
  if (!brew) return { target: 'tmux', status: 'manual_required', command: 'Install Homebrew, then run: brew install tmux', error: before.error || 'tmux not found' };
  const origin = await tmuxInstallOrigin(before.bin, brew);
  if (before.bin && origin.manager === 'npm') {
    const repairCommand = 'npm i -g tmux@latest';
    if (args.includes('--dry-run') || opts.dryRun) return { target: 'tmux', status: 'dry_run', manager: 'npm', command: repairCommand, error: before.error || null };
    const npmBin = await which('npm').catch(() => null);
    if (!npmBin) return { target: 'tmux', status: 'manual_required', manager: 'npm', command: repairCommand, error: 'npm not found on PATH' };
    const question = `npm-managed tmux ${before.version || 'unknown'} is not ready. Upgrade with ${repairCommand}?`;
    if (!await confirmInstallYesDefault(question, args)) return { target: 'tmux', status: 'needs_approval', manager: 'npm', command: repairCommand, error: before.error || null };
    const install = await runProcess(npmBin, ['i', '-g', 'tmux@latest'], { timeoutMs: 180000, maxOutputBytes: 128 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
    if (install.code !== 0) return { target: 'tmux', status: 'failed', manager: 'npm', command: repairCommand, error: `${install.stderr || install.stdout || repairCommand + ' failed'}`.trim() };
    const after = await tmuxReadiness().catch((err) => ({ ok: false, error: err.message }));
    if (!after.ok) return { target: 'tmux', status: 'installed_not_ready', manager: 'npm', command: repairCommand, error: after.error || 'tmux upgraded with npm but is still not ready' };
    return { target: 'tmux', status: 'upgraded', manager: 'npm', command: repairCommand, bin: after.bin || null, version: after.version || null };
  }
  if (before.bin && origin.manager !== 'homebrew') {
    return {
      target: 'tmux',
      status: 'conflicting_tmux',
      bin: before.bin,
      version: before.version || null,
      manager: origin.manager,
      command,
      error: `${before.error || 'tmux is not ready'}; PATH resolves an unknown non-Homebrew tmux (${origin.reason}). Remove, upgrade with its owning package manager, or reorder PATH first, then run: ${command}`
    };
  }
  const repairCommand = before.bin ? 'brew upgrade tmux' : command;
  if (args.includes('--dry-run') || opts.dryRun) return { target: 'tmux', status: 'dry_run', command: repairCommand, error: before.error || null };
  const question = before.bin
    ? `Homebrew tmux ${before.version || 'unknown'} is too old. Upgrade to latest tmux with ${repairCommand}?`
    : `tmux is missing. Install latest tmux with ${repairCommand}?`;
  if (!await confirmInstallYesDefault(question, args)) return { target: 'tmux', status: 'needs_approval', command: repairCommand, error: before.error || null };
  const brewArgs = before.bin ? ['upgrade', 'tmux'] : ['install', 'tmux'];
  const install = await runProcess(brew, brewArgs, { timeoutMs: 180000, maxOutputBytes: 128 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) return { target: 'tmux', status: 'failed', command: repairCommand, error: `${install.stderr || install.stdout || repairCommand + ' failed'}`.trim() };
  const after = await tmuxReadiness().catch((err) => ({ ok: false, error: err.message }));
  if (!after.ok) return { target: 'tmux', status: 'installed_not_ready', command: repairCommand, error: after.error || 'tmux installed but not ready' };
  return { target: 'tmux', status: before.bin ? 'upgraded' : 'installed', command: repairCommand, bin: after.bin || null, version: after.version || null };
}

async function confirmInstallYesDefault(question, args = []) {
  if (shouldAutoApproveInstall(args)) return true;
  if (!canAskYesNo()) return false;
  const answer = (await askPostinstallQuestion(`${question} [Y/n] `)).trim();
  return answer === '' || /^(y|yes|예|네|응)$/i.test(answer);
}

async function tmuxInstallOrigin(bin, brewBin) {
  if (!bin) return { manager: 'missing', reason: 'tmux not found on PATH' };
  const resolved = await fsp.realpath(bin).catch(() => path.resolve(bin));
  if (brewBin) {
    const brewPrefix = await runProcess(brewBin, ['--prefix'], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch(() => null);
    const prefix = brewPrefix?.code === 0 ? brewPrefix.stdout.trim().split(/\r?\n/).pop() : '';
    const brewTmux = await runProcess(brewBin, ['list', '--versions', 'tmux'], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch(() => null);
    if (prefix && resolved.startsWith(path.resolve(prefix) + path.sep) && brewTmux?.code === 0) {
      return { manager: 'homebrew', reason: `${resolved} under ${prefix}` };
    }
  }
  const npmBin = await which('npm').catch(() => null);
  if (npmBin) {
    const npmPrefix = await runProcess(npmBin, ['prefix', '-g'], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch(() => null);
    const prefix = npmPrefix?.code === 0 ? npmPrefix.stdout.trim().split(/\r?\n/).pop() : '';
    const npmBinDir = prefix ? (process.platform === 'win32' ? prefix : path.join(prefix, 'bin')) : '';
    const npmRoot = prefix ? path.join(prefix, 'lib', 'node_modules') : '';
    if ((npmBinDir && path.resolve(bin).startsWith(path.resolve(npmBinDir) + path.sep)) || (npmRoot && resolved.startsWith(path.resolve(npmRoot) + path.sep))) {
      return { manager: 'npm', reason: `${bin} resolves through npm global prefix ${prefix}` };
    }
  }
  if (/\/node_modules\/(?:\.bin\/)?tmux(?:$|\/)/.test(resolved.split(path.sep).join('/'))) {
    return { manager: 'npm', reason: `${resolved} is inside node_modules` };
  }
  return { manager: 'unknown', reason: `${bin} resolves to ${resolved}` };
}

export async function maybePromptCodexUpdateForLaunch(args = [], opts = {}) {
  if (hasFlag(args, '--json') || hasFlag(args, '--skip-cli-tools') || hasFlag(args, '--skip-codex-update') || process.env.SKS_SKIP_CODEX_UPDATE === '1') return { status: 'skipped' };
  const latest = await npmPackageVersion('@openai/codex');
  const codex = await getCodexInfo().catch(() => ({}));
  const current = codexCliVersionNumber(codex.version);
  const command = 'npm i -g @openai/codex@latest';
  const label = opts.label || 'tmux launch';
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

export function shouldAutoApproveInstall(args = [], env = process.env) {
  return hasFlag(args, '--yes') || hasFlag(args, '-y') || isOpenClawRuntime(env);
}

function canAskYesNo() {
  return Boolean(input.isTTY && output.isTTY && process.env.CI !== 'true');
}

function hasFlag(args = [], name) {
  return args.includes(name);
}

function isOpenClawRuntime(env = process.env) {
  return ['SKS_OPENCLAW', 'OPENCLAW', 'OPENCLAW_AGENT', 'OPENCLAW_RUN_ID', 'OPENCLAW_SESSION_ID']
    .some((key) => /^(1|true|yes|y)$/i.test(String(env[key] || '').trim()));
}

async function installCodexLatest(command, latestVersion, previousVersion = null) {
  const npm = await which('npm').catch(() => null);
  if (!npm) return { status: 'failed', latest: latestVersion || null, previous: previousVersion || null, command, error: 'npm not found on PATH' };
  const install = await runProcess(npm, ['i', '-g', '@openai/codex@latest'], { timeoutMs: 180000, maxOutputBytes: 128 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) return { status: 'failed', latest: latestVersion || null, previous: previousVersion || null, command, error: `${install.stderr || install.stdout || command + ' failed'}`.trim() };
  const after = await getCodexInfo().catch(() => ({}));
  const afterVersion = codexCliVersionNumber(after.version);
  if (!after.bin) return { status: 'updated_not_reflected', latest: latestVersion || null, previous: previousVersion || null, version: afterVersion || null, command, error: 'npm completed, but codex is not on PATH. Restart the shell or set SKS_CODEX_BIN.' };
  if (latestVersion && afterVersion && compareVersions(afterVersion, latestVersion) < 0) {
    return { status: 'updated_not_reflected', latest: latestVersion, previous: previousVersion || null, version: afterVersion, bin: after.bin, command, error: `npm completed, but PATH still resolves Codex CLI ${afterVersion}; expected ${latestVersion}.` };
  }
  console.log(`Codex CLI ready: ${previousVersion || 'missing'} -> ${after.version || after.bin}`);
  return { status: previousVersion ? 'updated' : 'installed', latest: latestVersion || null, previous: previousVersion || null, version: afterVersion || null, raw_version: after.version || null, bin: after.bin || null, command };
}

function codexCliVersionNumber(versionText = '') {
  const match = String(versionText || '').match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  return match ? match[1] : null;
}

async function npmPackageVersion(name) {
  const envName = `SKS_NPM_VIEW_${String(name || '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_VERSION`;
  if (process.env[envName]) return { version: process.env[envName] };
  const npm = await which('npm').catch(() => null);
  if (!npm) return { error: 'npm not found' };
  const result = await runProcess(npm, ['view', name, 'version'], { timeoutMs: 5000, maxOutputBytes: 4096 });
  if (result.code !== 0) return { error: `${result.stderr || result.stdout || 'npm view failed'}`.trim() };
  return { version: result.stdout.trim().split(/\s+/).pop() };
}

function compareVersions(a, b) {
  const pa = String(a || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function isProjectSetupCandidate(root) {
  const markers = ['package.json', '.git', 'AGENTS.md', '.codex', '.sneakoscope'];
  for (const marker of markers) {
    if (await exists(path.join(root, marker))) return true;
  }
  return false;
}

export async function checkContext7(root) {
  const projectPath = path.join(root, '.codex', 'config.toml');
  const globalPath = path.join(process.env.HOME || '', '.codex', 'config.toml');
  const projectText = await safeReadText(projectPath);
  const globalText = await safeReadText(globalPath);
  const codex = await getCodexInfo().catch(() => ({}));
  let list = { checked: false, ok: false, stdout: '', stderr: '' };
  if (codex.bin) {
    const out = await runProcess(codex.bin, ['mcp', 'list'], { timeoutMs: 8000, maxOutputBytes: 32 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
    list = { checked: true, ok: out.code === 0 && /context7/i.test(`${out.stdout}\n${out.stderr}`), stdout: out.stdout || '', stderr: out.stderr || '' };
  }
  const result = {
    project: { path: projectPath, ok: hasContext7ConfigText(projectText) },
    global: { path: globalPath, ok: hasContext7ConfigText(globalText) },
    codex_mcp_list: list
  };
  result.ok = result.project.ok || result.codex_mcp_list.ok || (result.global.ok && !list.checked);
  return result;
}

export async function ensureProjectContext7Config(root, transport = 'local') {
  const configPath = path.join(root, '.codex', 'config.toml');
  await ensureDir(path.dirname(configPath));
  const current = await safeReadText(configPath);
  const block = context7ConfigToml(transport).trim();
  const existingBlock = /(^|\n)\[mcp_servers\.context7\]\n[\s\S]*?(?=\n\[[^\]]+\]|\s*$)/;
  if (existingBlock.test(current)) {
    const next = current.replace(existingBlock, `$1${block}\n`);
    if (next === current) return false;
    await writeTextAtomic(configPath, next.endsWith('\n') ? next : `${next}\n`);
    return true;
  }
  if (hasContext7ConfigText(current)) return false;
  await writeTextAtomic(configPath, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`);
  return true;
}

export async function checkRequiredSkills(root, skillRoot = root ? path.join(root, '.agents', 'skills') : globalCodexSkillsRoot()) {
  const missing = [];
  for (const name of [...DOLLAR_SKILL_NAMES, ...RECOMMENDED_SKILLS]) {
    if (!(await exists(path.join(skillRoot, name, 'SKILL.md')))) missing.push(name);
  }
  return { ok: missing.length === 0, root: skillRoot, missing };
}

export function globalCodexSkillsRoot(home = process.env.HOME || os.homedir()) {
  return path.join(home, '.agents', 'skills');
}

function isStableSksBin(candidate) {
  return Boolean(candidate) && !isTransientNpmBinPath(candidate);
}

function isTransientNpmBinPath(candidate) {
  const normalized = String(candidate || '').split(path.sep).join('/');
  return normalized.includes('/_npx/')
    || normalized.includes('/_cacache/tmp/')
    || /\/npm-cache\/_npx\//.test(normalized)
    || (/\/node_modules\/\.bin\/sks$/.test(normalized) && normalized.includes('/.npm-cache/'));
}

async function safeReadText(file, fallback = '') {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch {
    return fallback;
  }
}

async function codexLbLoginCallCount(home) {
  return (await safeReadText(path.join(home, '.codex', 'login-calls.log'))).trim().split(/\r?\n/).filter(Boolean).length;
}

function codexLbPostinstallEnv(baseEnv, overrides = {}) {
  return {
    ...baseEnv,
    SKS_POSTINSTALL_NO_BOOTSTRAP: '1',
    SKS_SKIP_POSTINSTALL_SHIM: '1',
    SKS_SKIP_POSTINSTALL_CONTEXT7: '1',
    SKS_SKIP_POSTINSTALL_GETDESIGN: '1',
    SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1',
    SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH: '0',
    SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1',
    ...overrides
  };
}

export async function selftestCodexLb(tmp) {
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
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model = "gpt-5.5"\nmodel_reasoning_effort = "low"\nservice_tier = "fast"\n\n[profiles.custom]\nmodel_reasoning_effort = "low"\n\n[notice]\nfast_default_opt_out = true\n\n[features]\ncodex_hooks = true\n');
  const codexLbEnvForSelftest = { HOME: codexLbHome, SKS_GLOBAL_ROOT: path.join(tmp, 'codex-lb-global'), PATH: `${codexLbFakeBin}${path.delimiter}${process.env.PATH || ''}`, SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' };
  const codexLbSetup = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key', 'sk-test', '--json'], {
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
  if (!codexLbSetupJson.ok || codexLbSetupJson.base_url !== 'https://lb.example.test/backend-api/codex' || !hasTopLevelCodexLbSelected(codexLbConfig) || !codexLbConfig.includes('[model_providers.codex-lb]') || !codexLbEnv.includes("CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'") || !codexLbEnv.includes("CODEX_LB_API_KEY='sk-test'") || codexLbSetupJson.codex_environment?.ok !== true || codexLbSetupJson.codex_login?.status !== 'skipped' || codexLbAuth.trim()) throw new Error('selftest: codex-lb setup');
  if (!codexLbConfig.includes('requires_openai_auth = true')) throw new Error('selftest: codex-lb setup did not write upstream-required requires_openai_auth');
  const codexLbFailLaunchctl = path.join(codexLbFakeBin, 'launchctl-fail');
  await writeTextAtomic(codexLbFailLaunchctl, '#!/bin/sh\necho "launchctl denied" >&2\nexit 7\n');
  await fsp.chmod(codexLbFailLaunchctl, 0o755);
  const codexLbFailedLaunchEnv = await configureCodexLb({ home: path.join(tmp, 'codex-lb-launch-fail-home'), host: 'lb.example.test', apiKey: 'sk-fail', forceLaunchEnv: true, launchctlBin: codexLbFailLaunchctl });
  if (codexLbFailedLaunchEnv.ok || codexLbFailedLaunchEnv.status !== 'launch_env_failed' || !/launchctl denied/.test(codexLbFailedLaunchEnv.error || '')) throw new Error('selftest: codex-lb setup must expose launch-env failure');
  if (!hasCodexUnstableFeatureWarningSuppression(codexLbConfig)) throw new Error('selftest: codex-lb setup did not suppress Codex unstable feature warning');
  await initProject(codexLbHome, { installScope: 'global', force: true, repair: true });
  const codexLbRepairSetupConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (!hasTopLevelCodexLbSelected(codexLbRepairSetupConfig) || !codexLbRepairSetupConfig.includes('[model_providers.codex-lb]') || !codexLbRepairSetupConfig.includes('https://lb.example.test/backend-api/codex') || codexLbRepairSetupConfig.includes('sk-test')) throw new Error('selftest: init codex-lb');
  if (!codexLbRepairSetupConfig.includes('requires_openai_auth = true')) throw new Error('selftest: init codex-lb did not preserve upstream-required requires_openai_auth');
  if (!hasCodexUnstableFeatureWarningSuppression(codexLbRepairSetupConfig)) throw new Error('selftest: init codex-lb did not suppress Codex unstable feature warning');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), `${codexLbConfig}\n[mcp_servers.supabase]\nurl = "https://mcp.supabase.com/mcp?project_ref=ref&read_only=true&features=database,docs"\n`);
  const ptmp = path.join(tmp, 'codex-lb-project-config'), prevHome = process.env.HOME;
  try { process.env.HOME = codexLbHome; await initProject(ptmp, { installScope: 'global' }); }
  finally { if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome; }
  const pcfg = await safeReadText(path.join(ptmp, '.codex', 'config.toml'));
  if (!hasTopLevelCodexLbSelected(pcfg) || !pcfg.includes('[model_providers.codex-lb]') || !pcfg.includes('[mcp_servers.supabase]') || !pcfg.includes('read_only=true')) throw new Error('selftest: project codex-lb');
  if (!pcfg.includes('requires_openai_auth = true')) throw new Error('selftest: project codex-lb did not copy upstream-required requires_openai_auth');
  if (!hasCodexUnstableFeatureWarningSuppression(pcfg)) throw new Error('selftest: project codex-lb config did not suppress Codex unstable feature warning');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
  const codexLbRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'auth', 'repair', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbRepair.code !== 0) throw new Error(`selftest: codex-lb repair exited ${codexLbRepair.code}: ${codexLbRepair.stderr}`);
  const codexLbRepairJson = JSON.parse(codexLbRepair.stdout);
  const codexLbRepairedAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (!codexLbRepairJson.ok || codexLbRepairJson.status !== 'repaired' || codexLbRepairJson.codex_environment?.ok !== true || codexLbRepairJson.codex_login?.status !== 'skipped' || !codexLbRepairedAuth.includes('"auth_mode":"browser"') || codexLbRepairedAuth.includes('sk-test')) throw new Error('selftest: codex-lb repair');
  const codexLbLegacyRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'auth', 'repair', '--json'], { cwd: tmp, env: { ...codexLbEnvForSelftest, SKS_CODEX_LB_SYNC_CODEX_LOGIN: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbLegacyRepair.code !== 0) throw new Error(`selftest: codex-lb legacy login repair exited ${codexLbLegacyRepair.code}: ${codexLbLegacyRepair.stderr}`);
  const codexLbLegacyRepairJson = JSON.parse(codexLbLegacyRepair.stdout);
  const codexLbLegacyAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (!codexLbLegacyRepairJson.ok || codexLbLegacyRepairJson.codex_login?.status !== 'synced' || !codexLbLegacyAuth.includes('"auth_mode":"apikey"') || !codexLbLegacyAuth.includes('sk-test')) throw new Error('selftest: codex-lb legacy login repair');
  const codexLbLoginCallsBeforePostinstall = await codexLbLoginCallCount(codexLbHome);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
  const codexLbPostinstall = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], {
    cwd: tmp,
    env: codexLbPostinstallEnv(codexLbEnvForSelftest),
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  if (codexLbPostinstall.code !== 0) throw new Error(`selftest: codex-lb postinstall auth preservation exited ${codexLbPostinstall.code}: ${codexLbPostinstall.stderr}`);
  const codexLbPostinstallAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbLoginCallsAfterPostinstall = await codexLbLoginCallCount(codexLbHome);
  if (!String(codexLbPostinstall.stdout || '').includes('codex-lb auth: preserved') || !codexLbPostinstallAuth.includes('"auth_mode":"browser"') || codexLbPostinstallAuth.includes('sk-test') || codexLbLoginCallsAfterPostinstall !== codexLbLoginCallsBeforePostinstall) throw new Error('selftest: postinstall auth');
  const postinstallEnvKeys = ['HOME', 'PATH', 'INIT_CWD', 'SKS_GLOBAL_ROOT', 'SKS_POSTINSTALL_BOOTSTRAP', 'SKS_POSTINSTALL_NO_BOOTSTRAP', 'SKS_SKIP_POSTINSTALL_SHIM', 'SKS_SKIP_POSTINSTALL_CONTEXT7', 'SKS_SKIP_POSTINSTALL_GETDESIGN', 'SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS', 'SKS_SKIP_POSTINSTALL_CODEX_LB_AUTH', 'SKS_SKIP_CODEX_LB_LAUNCH_ENV', 'SKS_CODEX_LB_SYNC_CODEX_LOGIN'];
  const postinstallEnvBefore = Object.fromEntries(postinstallEnvKeys.map((key) => [key, process.env[key]]));
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
      SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1'
    });
    await postinstall({
      bootstrap: async () => {
        await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
        await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model = "gpt-5.5"\nservice_tier = "fast"\n\n[features]\nhooks = true\n');
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
  if (!codexLbPostBootstrapConfig.includes('requires_openai_auth = true')) throw new Error('selftest: postinstall drift config did not restore upstream-required requires_openai_auth');
  const doctorProject = tmpdir();
  await ensureDir(path.join(doctorProject, '.git'));
  await writeTextAtomic(path.join(doctorProject, 'package.json'), '{"name":"codex-lb-doctor-project","version":"0.0.0"}\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n");
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"browser"}\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model = "gpt-5.5"\nservice_tier = "fast"\n\n[features]\nhooks = true\n');
  const codexLbDoctorRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'doctor', '--fix', '--json'], {
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
  if (!codexLbDoctorConfig.includes('requires_openai_auth = true')) throw new Error('selftest: doctor codex-lb did not restore upstream-required requires_openai_auth');
  // codex-lb auth: ChatGPT OAuth ↔ codex-lb env_key conflict reconciliation.
  const oauthAuthJson = JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: { id_token: 'oauth-id', access_token: 'oauth-access', refresh_token: 'oauth-refresh' },
    last_refresh: '2026-01-01T00:00:00Z'
  });
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), `${oauthAuthJson}\n`);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n");
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model_provider = "codex-lb"\n\n[model_providers.codex-lb]\nname = "OpenAI"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nenv_key = "CODEX_LB_API_KEY"\nsupports_websockets = true\nrequires_openai_auth = true\n');
  await fsp.rm(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), { force: true });
  const codexLbReconcileRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'auth', 'repair', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReconcileRepair.code !== 0) throw new Error(`selftest: codex-lb oauth reconcile repair exited ${codexLbReconcileRepair.code}: ${codexLbReconcileRepair.stderr}`);
  const codexLbReconcileJson = JSON.parse(codexLbReconcileRepair.stdout);
  const codexLbReconcileAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbReconcileBackup = await safeReadText(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'));
  if (codexLbReconcileJson.auth_reconcile?.status !== 'oauth_preserved' || !codexLbReconcileAuth.includes('oauth-id') || !codexLbReconcileAuth.includes('oauth-refresh') || codexLbReconcileAuth.includes('sk-test') || !codexLbReconcileBackup.includes('oauth-id') || !codexLbReconcileBackup.includes('oauth-refresh')) throw new Error('selftest: codex-lb oauth reconcile should preserve ChatGPT OAuth and back it up');
  // Opt-out path: SKS_CODEX_LB_NO_AUTH_RECONCILE=1 keeps auth.json untouched but still backs up the OAuth blob.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), `${oauthAuthJson}\n`);
  await fsp.rm(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), { force: true });
  const codexLbReconcileOptOutRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'auth', 'repair', '--json'], { cwd: tmp, env: { ...codexLbEnvForSelftest, SKS_CODEX_LB_NO_AUTH_RECONCILE: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReconcileOptOutRepair.code !== 0) throw new Error(`selftest: codex-lb oauth reconcile opt-out repair exited ${codexLbReconcileOptOutRepair.code}: ${codexLbReconcileOptOutRepair.stderr}`);
  const codexLbReconcileOptOutJson = JSON.parse(codexLbReconcileOptOutRepair.stdout);
  const codexLbReconcileOptOutAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbReconcileOptOutBackup = await safeReadText(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'));
  if (codexLbReconcileOptOutJson.auth_reconcile?.status !== 'backup_only' || !codexLbReconcileOptOutAuth.includes('oauth-id') || !codexLbReconcileOptOutBackup.includes('oauth-id')) throw new Error('selftest: codex-lb oauth reconcile opt-out should back up but not rewrite auth.json');
  // Restore path: older SKS versions could leave the codex-lb API key in auth.json. Repair should
  // restore the ChatGPT OAuth backup while keeping codex-lb selected for provider routing.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","OPENAI_API_KEY":"sk-test"}\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), `${oauthAuthJson}\n`);
  const codexLbReconcileRestoreRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'auth', 'repair', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReconcileRestoreRepair.code !== 0) throw new Error(`selftest: codex-lb oauth restore repair exited ${codexLbReconcileRestoreRepair.code}: ${codexLbReconcileRestoreRepair.stderr}`);
  const codexLbReconcileRestoreJson = JSON.parse(codexLbReconcileRestoreRepair.stdout);
  const codexLbReconcileRestoreAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  const codexLbReconcileRestoreConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (codexLbReconcileRestoreJson.auth_reconcile?.status !== 'oauth_restored' || !codexLbReconcileRestoreAuth.includes('oauth-id') || codexLbReconcileRestoreAuth.includes('sk-test') || !hasTopLevelCodexLbSelected(codexLbReconcileRestoreConfig)) throw new Error('selftest: codex-lb oauth restore should replace apikey auth.json with ChatGPT OAuth backup while keeping codex-lb selected');
  // codex-lb auth: release flow — restore ChatGPT OAuth from backup so the user can return to
  // the official ChatGPT account login. Default deselects model_provider; flags control whether
  // the provider stays selected and whether the backup file is removed after restore.
  const codexLbReleaseConfig = 'model_provider = "codex-lb"\n\n[model_providers.codex-lb]\nname = "OpenAI"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nenv_key = "CODEX_LB_API_KEY"\nsupports_websockets = true\nrequires_openai_auth = true\n';
  const codexLbReleaseEnv = "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n";
  const codexLbReleaseApikeyAuth = '{"auth_mode":"apikey","OPENAI_API_KEY":"sk-test"}\n';
  const codexLbReleaseOauthBackup = `${oauthAuthJson}\n`;
  // Happy path: deselect model_provider and preserve backup file.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), codexLbReleaseOauthBackup);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), codexLbReleaseEnv);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbReleaseRun = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-lb', 'release', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
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
  const codexLbReleaseKeepRun = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-lb', 'release', '--keep-provider', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReleaseKeepRun.code !== 0) throw new Error(`selftest: codex-lb release --keep-provider exited ${codexLbReleaseKeepRun.code}: ${codexLbReleaseKeepRun.stderr}`);
  const codexLbReleaseKeepJson = JSON.parse(codexLbReleaseKeepRun.stdout);
  const codexLbReleaseKeepConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (codexLbReleaseKeepJson.status !== 'released' || codexLbReleaseKeepJson.provider_unselected !== false || !hasTopLevelCodexLbSelected(codexLbReleaseKeepConfig)) throw new Error('selftest: codex-lb release --keep-provider should leave model_provider = "codex-lb" intact');
  // --delete-backup: restore auth.json and remove the backup file.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), codexLbReleaseOauthBackup);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbReleaseDeleteRun = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-lb', 'release', '--delete-backup', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (codexLbReleaseDeleteRun.code !== 0) throw new Error(`selftest: codex-lb release --delete-backup exited ${codexLbReleaseDeleteRun.code}: ${codexLbReleaseDeleteRun.stderr}`);
  const codexLbReleaseDeleteJson = JSON.parse(codexLbReleaseDeleteRun.stdout);
  const codexLbReleaseDeleteBackupExists = await exists(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'));
  if (codexLbReleaseDeleteJson.status !== 'released' || codexLbReleaseDeleteJson.backup_removed !== true || codexLbReleaseDeleteBackupExists) throw new Error('selftest: codex-lb release --delete-backup should remove the backup file after restore');
  // No backup: release should refuse and exit 1.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await fsp.rm(path.join(codexLbHome, '.codex', 'auth.chatgpt-backup.json'), { force: true });
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbReleaseMissingRun = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-lb', 'release', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const codexLbReleaseMissingJson = JSON.parse(codexLbReleaseMissingRun.stdout || '{}');
  const codexLbReleaseMissingAuth = await safeReadText(path.join(codexLbHome, '.codex', 'auth.json'));
  if (codexLbReleaseMissingRun.code === 0 || codexLbReleaseMissingJson.status !== 'no_backup' || !codexLbReleaseMissingAuth.includes('apikey')) throw new Error('selftest: codex-lb release with no backup should exit non-zero and report no_backup without touching auth.json');
  // unselect: flip model_provider off without touching auth.json or env file.
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), codexLbReleaseApikeyAuth);
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), codexLbReleaseConfig);
  const codexLbUnselectRun = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-lb', 'unselect', '--json'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
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
  const codexLbContext7Postinstall = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], {
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
  const codexLbMalformedPostinstall = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], {
    cwd: tmp,
    env: codexLbPostinstallEnv(codexLbEnvForSelftest),
    timeoutMs: 15000,
    maxOutputBytes: 128 * 1024
  });
  const codexLbLoginCallsAfterMalformed = await codexLbLoginCallCount(codexLbHome);
  if (codexLbMalformedPostinstall.code !== 0 || !String(codexLbMalformedPostinstall.stdout || '').includes('codex-lb auth: stored key missing') || codexLbLoginCallsAfterMalformed !== codexLbLoginCallsBeforeMalformed) throw new Error('selftest: bad codex-lb env');
  await fsp.rm(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), { force: true });
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), '[model_providers.codex-lb]\nname = "OpenAI"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nsupports_websockets = true\nrequires_openai_auth = true\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-legacy"}\n');
  const codexLbLoginCallsBeforeLegacyPostinstall = await codexLbLoginCallCount(codexLbHome);
  const codexLbLegacyPostinstall = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], {
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
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model_provider = "codex-lb"\n\n[model_providers.codex-lb]\nname = "OpenAI"\nbase_url = "https://lb.example.test/backend-api/codex"\nwire_api = "responses"\nsupports_websockets = true\nrequires_openai_auth = true\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-legacy-doctor"}\n');
  const codexLbLegacyDoctorProject = tmpdir();
  await ensureDir(path.join(codexLbLegacyDoctorProject, '.git'));
  await writeTextAtomic(path.join(codexLbLegacyDoctorProject, 'package.json'), '{"name":"codex-lb-legacy-doctor-project","version":"0.0.0"}\n');
  const codexLbLegacyDoctorRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'doctor', '--fix', '--json'], {
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
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model = "gpt-5.5"\nservice_tier = "fast"\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-env-only"}\n');
  const codexLbLoginCallsBeforeEnvOnlyPostinstall = await codexLbLoginCallCount(codexLbHome);
  const codexLbEnvOnlyPostinstall = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], {
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
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model = "gpt-5.5"\nservice_tier = "fast"\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'auth.json'), '{"auth_mode":"apikey","key":"sk-env-only-doctor"}\n');
  const codexLbEnvOnlyDoctorProject = tmpdir();
  await ensureDir(path.join(codexLbEnvOnlyDoctorProject, '.git'));
  await writeTextAtomic(path.join(codexLbEnvOnlyDoctorProject, 'package.json'), '{"name":"codex-lb-env-only-doctor-project","version":"0.0.0"}\n');
  const codexLbEnvOnlyDoctorRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'doctor', '--fix', '--json'], {
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
  const codexLbMissingCli = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], {
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
  const codexLbNotConfigured = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], {
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
  const codexLbStatusText = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-lb', 'status'], { cwd: tmp, env: codexLbEnvForSelftest, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (!String(codexLbStatusText.stdout || '').includes('Codex App auth:') || !String(codexLbStatusText.stdout || '').includes('sks codex-lb repair')) throw new Error('selftest: codex-lb status did not advertise App auth state and repair command');
  const nonInteractiveLaunchChainCalls = [];
  const nonInteractiveLaunch = await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (url, init) => {
      nonInteractiveLaunchChainCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: nonInteractiveLaunchChainCalls.length === 1 ? 'resp_noninteractive_1' : 'resp_noninteractive_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  if (!nonInteractiveLaunch.ok || nonInteractiveLaunch.status !== 'present' || nonInteractiveLaunch.chain_health?.status !== 'chain_ok' || nonInteractiveLaunchChainCalls.length !== 2 || nonInteractiveLaunchChainCalls[1].body.previous_response_id !== 'resp_noninteractive_1') throw new Error('selftest: non-interactive codex-lb launch path did not run response-chain preflight');
  const nonInteractiveBrokenLaunch = await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_noninteractive_broken' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'previous_response_not_found', message: 'Previous response not found.', param: 'previous_response_id' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  });
  if (nonInteractiveBrokenLaunch.status !== 'present' || nonInteractiveBrokenLaunch.bypass_codex_lb === true || nonInteractiveBrokenLaunch.chain_health?.status !== 'previous_response_not_found') throw new Error('selftest: previous_response_not_found should keep codex-lb active (stateless LB is normal), not silently bypass to ChatGPT OAuth');
  // Hard chain failure (e.g. 500) in non-interactive context should still keep codex-lb by default — the user explicitly configured it, so don't silently swap providers.
  const hardBrokenLaunchCalls = [];
  const hardBrokenLaunch = await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (_url, init) => {
      hardBrokenLaunchCalls.push({ body: JSON.parse(init.body) });
      if (!hardBrokenLaunchCalls[hardBrokenLaunchCalls.length - 1].body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_hardbroken_first' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: { type: 'server_error', code: 'internal_error', message: 'simulated upstream failure' } }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  });
  if (hardBrokenLaunch.status !== 'present' || hardBrokenLaunch.bypass_codex_lb === true || hardBrokenLaunch.chain_health?.status !== 'second_request_failed') throw new Error('selftest: hard codex-lb chain failure in non-interactive launch should default to keeping codex-lb active, not silently bypass');
  // SKS_CODEX_LB_AUTOBYPASS=1 restores the old silent-bypass behavior for CI/automation.
  process.env.SKS_CODEX_LB_AUTOBYPASS = '1';
  let autobypassLaunch;
  try {
    autobypassLaunch = await maybePromptCodexLbSetupForLaunch([], {
      home: codexLbHome,
      apiKey: 'sk-test',
      codexBin: path.join(codexLbFakeBin, 'codex'),
      syncLaunchEnv: false,
      timeoutMs: 1000,
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_autobypass_first' }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ error: { type: 'server_error', code: 'internal_error', message: 'simulated upstream failure' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    });
  } finally {
    delete process.env.SKS_CODEX_LB_AUTOBYPASS;
  }
  if (autobypassLaunch.status !== 'chain_unhealthy' || autobypassLaunch.bypass_codex_lb !== true || autobypassLaunch.chain_health?.status !== 'second_request_failed') throw new Error('selftest: SKS_CODEX_LB_AUTOBYPASS=1 should bypass codex-lb on hard chain failure');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'config.toml'), 'model = "gpt-5.5"\nservice_tier = "fast"\n');
  await writeTextAtomic(path.join(codexLbHome, '.codex', 'sks-codex-lb.env'), "export CODEX_LB_BASE_URL='https://lb.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='sk-test'\n");
  const missingProviderLaunchCalls = [];
  const missingProviderLaunch = await maybePromptCodexLbSetupForLaunch([], {
    home: codexLbHome,
    apiKey: 'sk-test',
    codexBin: path.join(codexLbFakeBin, 'codex'),
    syncLaunchEnv: false,
    timeoutMs: 1000,
    fetch: async (url, init) => {
      missingProviderLaunchCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: missingProviderLaunchCalls.length === 1 ? 'resp_missing_provider_1' : 'resp_missing_provider_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const missingProviderRepairedConfig = await safeReadText(path.join(codexLbHome, '.codex', 'config.toml'));
  if (!missingProviderLaunch.ok || missingProviderLaunch.status !== 'present' || missingProviderLaunch.chain_health?.status !== 'chain_ok' || missingProviderLaunchCalls.length !== 2 || !hasTopLevelCodexLbSelected(missingProviderRepairedConfig) || !missingProviderRepairedConfig.includes('[model_providers.codex-lb]') || !missingProviderRepairedConfig.includes('env_key = "CODEX_LB_API_KEY"') || !missingProviderRepairedConfig.includes('supports_websockets = true') || !missingProviderRepairedConfig.includes('requires_openai_auth = true')) throw new Error('selftest: bare sks launch did not restore missing upstream codex-lb provider block from stored env');
  const chainCalls = [];
  const okChain = await checkCodexLbResponseChain(
    { base_url: 'https://lb.example.test/backend-api/codex', env_path: path.join(codexLbHome, '.codex', 'sks-codex-lb.env') },
    {
      apiKey: 'sk-test',
      timeoutMs: 1000,
      fetch: async (url, init) => {
        chainCalls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ id: chainCalls.length === 1 ? 'resp_selftest_1' : 'resp_selftest_2' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
  );
  if (!okChain.ok || okChain.status !== 'chain_ok' || chainCalls.length !== 2 || !String(chainCalls[0].url).endsWith('/backend-api/codex/responses') || chainCalls[1].body.previous_response_id !== 'resp_selftest_1') throw new Error('selftest: codex-lb response chain health check did not verify previous_response_id continuity');
  const previousGlobalFetch = globalThis.fetch;
  const cacheCalls = [];
  const cachePath = path.join(codexLbHome, '.codex', 'chain-cache-selftest.json');
  try {
    globalThis.fetch = async (url, init) => {
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
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        if (!body.previous_response_id) return new Response(JSON.stringify({ id: 'resp_missing_selftest' }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'previous_response_not_found', message: 'Previous response not found.', param: 'previous_response_id' } }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
    }
  );
  if (brokenChain.ok || brokenChain.status !== 'previous_response_not_found' || brokenChain.chain_unhealthy !== true) throw new Error('selftest: codex-lb response chain health check did not detect previous_response_not_found');
  if (!/^model = "gpt-5\.5"/m.test(codexLbConfig) || !codexLbConfig.includes('service_tier = "fast"') || !codexLbConfig.includes('hooks = true') || hasDeprecatedCodexHooksFeatureFlag(codexLbConfig) || !codexLbConfig.includes('remote_control = true') || !codexLbConfig.includes('multi_agent = true') || !codexLbConfig.includes('fast_mode = true') || !codexLbConfig.includes('fast_mode_ui = true') || !codexLbConfig.includes('codex_git_commit = true') || !codexLbConfig.includes('computer_use = true') || !codexLbConfig.includes('browser_use = true') || !codexLbConfig.includes('browser_use_external = true') || !codexLbConfig.includes('guardian_approval = true') || !codexLbConfig.includes('tool_suggest = true') || !codexLbConfig.includes('apps = true') || !codexLbConfig.includes('plugins = true') || !codexLbConfig.includes('[plugins."latex@openai-bundled"]') || !codexLbConfig.includes('[plugins."documents@openai-primary-runtime"]') || !codexLbConfig.includes('[user.fast_mode]') || !codexLbConfig.includes('visible = true') || !codexLbConfig.includes('enabled = true') || !codexLbConfig.includes('default_profile = "sks-fast-high"') || !/\[profiles\.custom\][\s\S]*?model_reasoning_effort = "low"/.test(codexLbConfig) || !/\[profiles\.sks-fast-high\][\s\S]*?service_tier = "fast"/.test(codexLbConfig) || codexLbConfig.includes('fast_default_opt_out = true') || hasTopLevelCodexModeLock(codexLbConfig)) throw new Error('selftest: codex-lb setup did not preserve Codex App feature flags, default plugins, profile-scoped reasoning effort, Fast mode defaults, Codex Git commit generation, force GPT-5.5, or migrate the hooks feature flag');
  if (!hasCodexUnstableFeatureWarningSuppression(codexLbConfig)) throw new Error('selftest: codex-lb setup did not suppress Codex unstable feature warning');
  const codexLbLaunch = codexLaunchCommand(tmp, 'codex', []);
  if (!codexLbLaunch.includes('sks-codex-lb.env')) throw new Error('selftest: tmux launch command does not source codex-lb env file');
  if (!codexLbLaunch.includes("'--model' 'gpt-5.5'")) throw new Error('selftest: tmux launch command without args did not force GPT-5.5');
  if (!codexLbLaunch.includes('SKS_TMUX_LOGO_ANIMATION') || !codexLbLaunch.includes('SNEAKOSCOPE CODEX')) throw new Error('selftest: tmux launch command does not include the animated SKS logo intro');
  const madLaunchSource = await safeReadText(path.join(packageRoot(), 'src', 'cli', 'maintenance-commands.mjs'));
  if (!madLaunchSource.includes('const lb = await deps.maybePromptCodexLbSetupForLaunch(args)') || !madLaunchSource.includes("const launchLb = lb.status === 'present'") || !madLaunchSource.includes('codexLbImmediateLaunchOpts(cleanArgs, launchLb') || !madLaunchSource.includes('bypass_codex_lb') || !madLaunchSource.includes('model_provider="openai"') || !madLaunchSource.includes('codexLbFreshSession: true')) throw new Error('selftest: MAD launch does not sync codex-lb auth and fresh-session launch options');

}

function hasTopLevelCodexModeLock(text = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const top = (firstTable === -1 ? lines : lines.slice(0, firstTable)).join('\n');
  return /(^|\n)\s*model_reasoning_effort\s*=/.test(top);
}

function hasDeprecatedCodexHooksFeatureFlag(text = '') {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex((line) => line.trim() === '[features]');
  if (start === -1) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).some((line) => /^\s*codex_hooks\s*=/.test(line));
}

function hasCodexUnstableFeatureWarningSuppression(text = '') {
  return /(^|\n)\s*suppress_unstable_features_warning\s*=\s*true\s*(?:#.*)?(?=\n|$)/.test(String(text || ''));
}
