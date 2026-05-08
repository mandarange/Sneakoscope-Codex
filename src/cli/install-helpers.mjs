import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureDir, exists, globalSksRoot, packageRoot, runProcess, which, writeTextAtomic } from '../core/fsx.mjs';
import { getCodexInfo } from '../core/codex-adapter.mjs';
import { formatHarnessConflictReport, llmHarnessCleanupPrompt, scanHarnessConflicts } from '../core/harness-conflicts.mjs';
import { installSkills } from '../core/init.mjs';
import { context7ConfigToml, DOLLAR_SKILL_NAMES, GETDESIGN_REFERENCE, hasContext7ConfigText, RECOMMENDED_SKILLS } from '../core/routes.mjs';
import { platformTmuxInstallHint, tmuxReadiness } from '../core/tmux-ui.mjs';

export async function postinstall({ bootstrap }) {
  const installRoot = path.resolve(process.env.INIT_CWD || process.cwd());
  const conflictScan = await scanHarnessConflicts(installRoot);
  if (conflictScan.hard_block) {
    await postinstallHarnessConflictNotice(conflictScan);
    return;
  }
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
  const globalSkills = await ensureGlobalCodexSkillsDuringInstall();
  if (globalSkills.status === 'installed') console.log(`Codex App global $ skills: installed in ${globalSkills.root} (${globalSkills.installed_count} skills).`);
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
    return;
  }
  console.log('\nNext:');
  console.log('  sks bootstrap');
  console.log(`\nSKS bootstrap was not run automatically: ${bootstrapDecision.reason}.`);
  console.log('This initializes the current project, installs SKS Codex App skills, verifies Codex App/Context7 readiness, and checks tmux/runtime dependencies.');
  console.log('Dependency repair: sks deps check; sks deps install tmux');
  console.log('Open runtime after readiness is green: sks\n');
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
  const list = await runProcess(codex.bin, ['mcp', 'list'], { timeoutMs: 8000, maxOutputBytes: 32 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (list.code === 0 && /context7/i.test(`${list.stdout}\n${list.stderr}`)) return { status: 'present' };
  const add = await runProcess(codex.bin, ['mcp', 'add', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp@latest'], { timeoutMs: 30000, maxOutputBytes: 64 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (add.code === 0) return { status: 'installed' };
  return { status: 'failed', error: `${add.stderr || add.stdout || 'codex mcp add failed'}`.trim() };
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
