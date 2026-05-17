import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { COMMANDS } from '../../cli/command-registry.mjs';
import { flag } from '../../cli/args.mjs';
import { printJson, sksTextLogo } from '../../cli/output.mjs';
import { PACKAGE_VERSION, ensureDir, exists, nowIso, projectRoot, readJson, runProcess, sksRoot, tmpdir, writeJsonAtomic } from '../fsx.mjs';
import { COMMAND_CATALOG, DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS, USAGE_TOPICS, routePrompt, routeReasoning, reasoningInstruction } from '../routes.mjs';
import { initProject, normalizeInstallScope, sksCommandPrefix } from '../init.mjs';
import { buildFeatureRegistry, validateFeatureRegistry } from '../feature-registry.mjs';
import { hooksExplainReport } from '../../cli/feature-commands.mjs';
import { writeSelftestRouteProof } from '../proof/selftest-proof-fixtures.mjs';
import { createMission } from '../mission.mjs';

export async function helpCommand(args = []) {
  const topic = args[0];
  if (topic) return usageCommand([topic]);
  console.log(`${sksTextLogo()}\n\nUsage\n`);
  console.log('  sks');
  console.log('  sks help [topic]');
  console.log('  sks commands [--json]');
  console.log('  sks dollar-commands [--json]');
  console.log('  sks proof show --json');
  console.log('');
  for (const row of commandRows().filter((entry) => entry.maturity !== 'labs')) {
    console.log(`  ${row.usage.padEnd(58)} ${row.description}`);
  }
  console.log('\nThree core promises: Completion Proof for serious routes, Image Voxel TriWiki for visual routes, and release-gated Codex App/codex-lb/hooks/Rust evidence.');
}

export function commandsCommand(args = []) {
  const commands = commandRows();
  if (flag(args, '--json')) {
    return printJson({
      schema: 'sks.command-registry.v1',
      aliases: ['sks', 'sneakoscope'],
      commands
    });
  }
  console.log(`${sksTextLogo()}\n\nCommands\n`);
  const width = Math.max(...commands.map((entry) => entry.usage.length));
  for (const entry of commands) console.log(`${entry.usage.padEnd(width)}  ${entry.description}`);
}

export function dollarCommandsCommand(args = []) {
  const out = { dollar_commands: DOLLAR_COMMANDS, app_skill_aliases: DOLLAR_COMMAND_ALIASES };
  if (flag(args, '--json')) return printJson(out);
  console.log(`${sksTextLogo()}\n\n$ Commands\n`);
  const width = Math.max(...DOLLAR_COMMANDS.map((entry) => entry.command.length));
  for (const entry of DOLLAR_COMMANDS) console.log(`${entry.command.padEnd(width)}  ${entry.route}: ${entry.description}`);
  console.log(`\nCanonical Codex App picker skills: ${DOLLAR_COMMAND_ALIASES.map((entry) => entry.app_skill).join(', ')}`);
}

export function aliasesCommand() {
  console.log('Aliases');
  console.log('- sks, sneakoscope');
  console.log('- $ aliases:');
  for (const entry of DOLLAR_COMMAND_ALIASES) console.log(`  ${entry.app_skill} -> ${entry.canonical}`);
}

export function dfixCommand() {
  console.log(`SKS Direct Fix Mode

Prompt command:
  $DFix <tiny direct fix request>

Rules:
  Apply only the requested tiny copy/config/docs/labels/spacing/translation/simple mechanical edit.
  Keep verification cheap and explicit.
  Finish with a DFix completion summary and one Honest check line.`);
}

export function usageCommand(args = []) {
  const topic = args[0] || 'overview';
  if (topic === 'overview') {
    console.log(`Usage topics: ${USAGE_TOPICS}`);
    console.log('Try: sks usage goal, sks usage team, sks usage image-ux-review');
    return;
  }
  const row = commandRows().find((entry) => entry.name === topic);
  if (row) {
    console.log(`${row.name}\n`);
    console.log(`Usage: ${row.usage}`);
    console.log(row.description);
    return;
  }
  const route = DOLLAR_COMMANDS.find((entry) => entry.command.toLowerCase() === `$${topic}`.toLowerCase());
  if (route) {
    console.log(`${route.command}\n`);
    console.log(`${route.route}: ${route.description}`);
    return;
  }
  console.log(`Unknown usage topic: ${topic}`);
  console.log(`Known topics: ${USAGE_TOPICS}`);
}

export function quickstartCommand() {
  console.log(`Sneakoscope Codex Quickstart

  sks setup --local-only
  sks doctor
  sks commands
  sks dollar-commands
  sks all-features selftest --mock --execute-fixtures --strict-artifacts --json

For implementation work, use Codex App prompt routes such as $Team, $Goal, $QA-LOOP, $Image-UX-Review, and $Computer-Use.`);
}

export async function updateCheckCommand(args = []) {
  const latest = await npmViewVersion('sneakoscope');
  const result = {
    package: 'sneakoscope',
    current: PACKAGE_VERSION,
    runtime_current: PACKAGE_VERSION,
    latest: latest.version,
    update_available: latest.version ? compareVersions(latest.version, PACKAGE_VERSION) > 0 : false,
    error: latest.error || null
  };
  if (flag(args, '--json')) return printJson(result);
  console.log(`${sksTextLogo()}\n\nUpdate Check`);
  console.log(`Current: ${result.current}`);
  console.log(`Latest:  ${result.latest || 'unknown'}`);
  console.log(`Update:  ${result.update_available ? 'available' : 'not needed'}`);
  if (result.error) console.log(`Error:   ${result.error}`);
  if (result.update_available) console.log(`Run:     npm i -g sneakoscope@${result.latest}`);
}

export async function setupCommand(args = []) {
  const root = await projectRoot();
  const installScope = installScopeFromArgs(args);
  const res = await initProject(root, {
    force: flag(args, '--force'),
    installScope,
    localOnly: flag(args, '--local-only'),
    globalCommand: 'sks'
  });
  const result = {
    schema: 'sks.setup.v1',
    ok: true,
    root,
    install_scope: installScope,
    command_prefix: sksCommandPrefix(installScope, { globalCommand: 'sks' }),
    created: res.created || [],
    local_only: flag(args, '--local-only')
  };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Setup complete: ${root}`);
  console.log(`Install scope: ${installScope}`);
  for (const file of result.created) console.log(`- ${file}`);
}

export async function bootstrapCommand(args = []) {
  return setupCommand(['--local-only', ...args]);
}

export async function initCommand(args = []) {
  return setupCommand(args);
}

export async function fixPathCommand(args = []) {
  const root = await projectRoot();
  const installScope = installScopeFromArgs(args);
  await initProject(root, { installScope, localOnly: flag(args, '--local-only'), globalCommand: 'sks', force: true });
  const result = {
    schema: 'sks.fix-path.v1',
    ok: true,
    root,
    install_scope: installScope,
    hook_command_prefix: sksCommandPrefix(installScope, { globalCommand: 'sks' }),
    hooks: path.join(root, '.codex', 'hooks.json')
  };
  if (flag(args, '--json')) return printJson(result);
  console.log(`SKS hook path refreshed: ${path.relative(root, result.hooks)}`);
}

export async function depsCommand(sub = 'check', args = []) {
  const action = sub || 'check';
  if (action !== 'check' && action !== 'status') {
    console.error('Usage: sks deps check [--json]');
    process.exitCode = 1;
    return;
  }
  const npm = whichSync('npm');
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  const root = await sksRoot();
  const result = {
    schema: 'sks.deps-status.v1',
    root,
    ready: Boolean(nodeOk && npm),
    node: { ok: nodeOk, version: process.version },
    npm: { ok: Boolean(npm), bin: npm },
    next_actions: [
      ...(!nodeOk ? ['Install Node.js 20.11+.'] : []),
      ...(!npm ? ['Install npm or a Node.js distribution that includes npm.'] : [])
    ]
  };
  if (flag(args, '--json')) return printJson(result);
  console.log('SKS Dependencies');
  console.log(`Node: ${result.node.ok ? 'ok' : 'missing'} ${result.node.version}`);
  console.log(`npm:  ${result.npm.ok ? 'ok' : 'missing'} ${result.npm.bin || ''}`.trim());
  if (!result.ready) process.exitCode = 1;
}

export async function postinstallCommand(args = []) {
  const { postinstall } = await import('../../cli/install-helpers.mjs');
  return postinstall({ bootstrap: flag(args, '--bootstrap') });
}

export async function selftestCommand(args = []) {
  process.env.CI = 'true';
  const root = await projectRoot();
  const tmp = tmpdir();
  await ensureDir(tmp);
  const registry = await buildFeatureRegistry({ root });
  const coverage = validateFeatureRegistry(registry);
  if (!coverage.ok) throw new Error(`selftest: feature registry blocked: ${coverage.blockers.join(', ')}`);
  const mission = await createMission(tmp, { mode: 'team', prompt: 'selftest route proof fixture' });
  await writeSelftestRouteProof(tmp, { missionId: mission.id, kind: 'team_gate' });
  const proof = await readJson(path.join(tmp, '.sneakoscope', 'missions', mission.id, 'completion-proof.json'), null);
  if (!proof?.mission_id) throw new Error('selftest: completion proof fixture missing');
  const hookExplain = hooksExplainReport();
  if (!hookExplain.events.includes('Stop')) throw new Error('selftest: hook explain missing Stop');
  const result = {
    schema: 'sks.selftest.v1',
    ok: true,
    version: PACKAGE_VERSION,
    generated_at: nowIso(),
    checks: ['feature_registry', 'route_completion_proof_fixture', 'hooks_policy_surface'],
    tmp_root: tmp
  };
  if (flag(args, '--json')) return printJson(result);
  console.log('SKS selftest passed');
}

export async function reasoningCommand(args = []) {
  const prompt = args.filter((arg) => !String(arg).startsWith('--')).join(' ').trim();
  const route = routePrompt(prompt || '$SKS');
  const info = routeReasoning(route, prompt);
  const result = {
    route: route?.command || '$SKS',
    effort: info.effort,
    profile: info.profile,
    reason: info.reason,
    temporary: true,
    instruction: reasoningInstruction(info)
  };
  if (flag(args, '--json')) return printJson(result);
  console.log('SKS Reasoning Route');
  console.log(`Route:   ${result.route}`);
  console.log(`Effort:  ${result.effort}`);
  console.log(`Profile: ${result.profile}`);
}

export async function tmuxCommand(sub = 'check', args = []) {
  const { runTmuxStatus, tmuxReadiness } = await import('../tmux-ui.mjs');
  const action = sub || 'check';
  if (action === 'status' || action === 'banner') return runTmuxStatus(action === 'banner' ? ['--once', ...args] : args);
  const status = await tmuxReadiness().catch((err) => ({ ok: false, error: err.message }));
  if (flag(args, '--json')) return printJson({ schema: 'sks.tmux-status.v1', ...status });
  console.log(`tmux: ${status.ok ? 'ok' : 'missing'} ${status.version || status.error || ''}`.trim());
  if (!status.ok) process.exitCode = 1;
}

export async function autoReviewCommand(sub = 'status', args = []) {
  const { autoReviewStatus, enableAutoReview, disableAutoReview } = await import('../auto-review.mjs');
  const action = sub || 'status';
  const result = action === 'enable' || action === 'start'
    ? await enableAutoReview({ high: flag(args, '--high') })
    : action === 'disable'
      ? await disableAutoReview()
      : await autoReviewStatus();
  if (flag(args, '--json')) return printJson(result);
  console.log(JSON.stringify(result, null, 2));
}

function commandRows() {
  const registry = new Map(Object.entries(COMMANDS).map(([name, meta]) => [name, meta]));
  return COMMAND_CATALOG.map((entry) => ({
    name: entry.name,
    usage: entry.usage,
    description: entry.description,
    maturity: registry.get(entry.name)?.maturity || entry.maturity || 'labs'
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function installScopeFromArgs(args = [], fallback = 'global') {
  if (flag(args, '--project')) return 'project';
  if (flag(args, '--global')) return 'global';
  const index = args.indexOf('--install-scope');
  return normalizeInstallScope(index >= 0 && args[index + 1] ? args[index + 1] : fallback);
}

async function npmViewVersion(name) {
  const npm = whichSync('npm');
  if (!npm) return { version: null, error: 'npm not found on PATH' };
  const result = await runProcess(npm, ['view', name, 'version', '--silent'], { timeoutMs: 15000, maxOutputBytes: 4096 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (result.code !== 0) return { version: null, error: (result.stderr || result.stdout || 'npm view failed').trim() };
  return { version: String(result.stdout || '').trim().split(/\s+/).pop() || null };
}

function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function whichSync(command) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'command', process.platform === 'win32' ? [command] : ['-v', command], {
    encoding: 'utf8',
    shell: process.platform !== 'win32'
  });
  return result.status === 0 ? String(result.stdout || '').trim().split(/\r?\n/)[0] : null;
}
