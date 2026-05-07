import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureDir, exists, packageRoot, runProcess, which, writeTextAtomic } from '../core/fsx.mjs';
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
  const candidate = await isProjectSetupCandidate(path.resolve(root || process.cwd()));
  if (!candidate && process.env.SKS_POSTINSTALL_BOOTSTRAP !== '1') return { run: false, reason: 'no project marker found in install cwd' };
  if (process.env.SKS_POSTINSTALL_BOOTSTRAP === '1') return { run: true, reason: 'forced by SKS_POSTINSTALL_BOOTSTRAP=1' };
  return { run: true, reason: 'auto-running sks setup --bootstrap --install-scope global --force' };
}

async function runPostinstallBootstrap(root, bootstrap) {
  const previousCwd = process.cwd();
  process.chdir(path.resolve(root || previousCwd));
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
    return { status: skills.ok ? 'installed' : 'partial', root, installed_count: install.installed_skills.length, removed_aliases: install.removed_agent_skill_aliases, missing_skills: skills.missing };
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
  const tmux = await tmuxReadiness().catch((err) => ({ ok: false, version: null, error: err.message }));
  return {
    codex,
    tmux: {
      ok: Boolean(tmux.ok),
      bin: tmux.bin || null,
      version: tmux.version || null,
      min_version: tmux.min_version || '3.0',
      current_session: Boolean(tmux.current_session),
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
