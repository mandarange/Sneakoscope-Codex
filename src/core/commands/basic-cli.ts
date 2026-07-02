import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { COMMANDS, LEGACY_COMMAND_ALIASES, type CommandEntry } from '../../cli/command-registry.js';
import { flag } from '../../cli/args.js';
import { printJson, sksTextLogo } from '../../cli/output.js';
import { ui as cliUi } from '../../cli/cli-theme.js';
import { PACKAGE_VERSION, ensureDir, exists, nowIso, projectRoot, readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { COMMAND_CATALOG, DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS, USAGE_TOPICS, routePrompt, routeReasoning, reasoningInstruction } from '../routes.js';
import { initProject, normalizeInstallScope, sksCommandPrefix } from '../init.js';
import { buildFeatureRegistry, validateFeatureRegistry } from '../feature-registry.js';
import { hooksExplainReport } from '../../cli/feature-commands.js';
import { writeSelftestRouteProof } from '../proof/selftest-proof-fixtures.js';
import { createMission } from '../mission.js';
import { formatSksUpdateCheckText, runSksUpdateCheck, runSksUpdateNow } from '../update-check.js';
import { withSecretPreservationGuard } from '../config/config-migration-journal.js';

interface CommandRow {
  name: string;
  usage: string;
  description: string;
  maturity: CommandEntry['maturity'];
}

export async function helpCommand(args: string[] = []): Promise<void | unknown> {
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

export function commandsCommand(args: string[] = []): unknown {
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

export function dollarCommandsCommand(args: any = []) {
  const out = { dollar_commands: DOLLAR_COMMANDS, app_skill_aliases: DOLLAR_COMMAND_ALIASES };
  if (flag(args, '--json')) return printJson(out);
  console.log(`${sksTextLogo()}\n\n$ Commands\n`);
  const width = Math.max(...DOLLAR_COMMANDS.map((entry: any) => entry.command.length));
  for (const entry of DOLLAR_COMMANDS) console.log(`${entry.command.padEnd(width)}  ${entry.route}: ${entry.description}`);
  console.log(`\nCanonical Codex App picker skills: ${DOLLAR_COMMAND_ALIASES.map((entry: any) => entry.app_skill).join(', ')}`);
}

export function aliasesCommand() {
  console.log('Aliases');
  console.log('- sks, sneakoscope');
  console.log('- CLI compatibility aliases:');
  for (const [alias, canonical] of Object.entries(LEGACY_COMMAND_ALIASES)) console.log(`  sks ${alias} -> sks ${canonical}`);
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

export function usageCommand(args: any = []) {
  const topic = args[0] || 'overview';
  if (topic === 'overview') {
    console.log(`Usage topics: ${USAGE_TOPICS}`);
    console.log('Try: sks usage goal, sks usage team, sks usage image-ux-review');
    return;
  }
  const row = commandRows().find((entry: any) => entry.name === topic);
  if (row) {
    console.log(`${row.name}\n`);
    console.log(`Usage: ${row.usage}`);
    console.log(row.description);
    return;
  }
  const route = DOLLAR_COMMANDS.find((entry: any) => entry.command.toLowerCase() === `$${topic}`.toLowerCase());
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

For implementation work, use Codex App prompt routes such as $Naruto, $Goal, $QA-LOOP, $Image-UX-Review, and $Computer-Use.`);
}

export async function updateCheckCommand(args: any = []) {
  const result = await runSksUpdateCheck();
  if (flag(args, '--json')) return printJson(result);
  cliUi.banner('update');
  result.update_available ? cliUi.warn('update available') : cliUi.ok('already current or no update required');
  console.log(`${sksTextLogo()}\n\n${formatSksUpdateCheckText(result)}`);
}

export async function updateCommand(sub: any = 'now', args: any = []) {
  let action = String(sub || 'now').toLowerCase();
  let effectiveArgs = args;
  if (action.startsWith('-')) {
    effectiveArgs = [String(sub), ...args];
    action = 'now';
  }
  if (action === 'check' || action === 'status') return updateCheckCommand(effectiveArgs);
  if (action !== 'now') {
    console.error('Usage: sks update [check|now] [--version <version>] [--json] [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const root = await projectRoot();
  const result = await withSecretPreservationGuard(root, 'update-now', async () => runSksUpdateNow({
    version: valueAfter(effectiveArgs, '--version') || valueAfter(effectiveArgs, '-v'),
    dryRun: flag(effectiveArgs, '--dry-run'),
    projectRoot: root,
    json: flag(effectiveArgs, '--json'),
    quiet: flag(effectiveArgs, '--quiet'),
    timeoutMs: 10 * 60 * 1000,
    maxOutputBytes: 128 * 1024
  }));
  if (flag(effectiveArgs, '--json')) return printJson(result);
  cliUi.banner('update');
  result.ok ? cliUi.ok(result.status) : result.status === 'updated_with_issues' ? cliUi.warn(result.status) : cliUi.fail(result.status || 'failed');
  console.log(`${sksTextLogo()}\n`);
  console.log(`SKS update ${result.status}`);
  if (result.command) console.log(`Command: ${result.command}`);
  if (result.global_root) console.log(`Global root: ${result.global_root}`);
  if (result.new_binary) console.log(`New binary: ${result.new_binary}`);
  if (result.new_version) console.log(`New version: ${result.new_version}`);
  if (result.project_receipt) console.log(`Migration receipt: ${result.project_receipt.root} (${result.migration_current ? 'current' : 'not current'})`);
  if (result.sks_menubar) console.log(`SKS menu bar: ${result.sks_menubar.status}${result.sks_menubar.app_path ? ` (${result.sks_menubar.app_path})` : ''}`);
  for (const stage of result.stages || []) console.log(`Stage ${stage.id}: ${stage.ok ? 'ok' : 'failed'} ${stage.status}`);
  if (result.verification?.length) {
    console.log('Self verification:');
    cliUi.table([
      ['check', 'status', 'detail'],
      ...result.verification.map((item) => [item.id, item.ok ? 'ok' : 'failed', item.detail || ''])
    ]);
    const remediation = [...new Set(result.verification.filter((item) => !item.ok).map((item) => item.remediation).filter((value): value is string => Boolean(value)))];
    for (const action of remediation) console.log(`Remediation: ${action}`);
  }
  if (result.error) console.log(`Error: ${result.error}`);
  if (!result.ok) process.exitCode = 1;
}

export async function setupCommand(args: any = []) {
  const root = await projectRoot();
  const installScope = installScopeFromArgs(args);
  let res: any = null;
  let cliTools: any = null;
  await withSecretPreservationGuard(root, 'setup-command', async () => {
    res = await initProject(root, {
      force: flag(args, '--force'),
      installScope,
      localOnly: flag(args, '--local-only'),
      globalCommand: 'sks'
    });
    const { ensureRelatedCliTools } = await import('../../cli/install-helpers.js');
    cliTools = await ensureRelatedCliTools(args);
  });
  const result = {
    schema: 'sks.setup.v1',
    ok: true,
    root,
    install_scope: installScope,
    command_prefix: sksCommandPrefix(installScope, { globalCommand: 'sks' }),
    created: res.created || [],
    local_only: flag(args, '--local-only'),
    cli_tools: cliTools
  };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Setup complete: ${root}`);
  console.log(`Install scope: ${installScope}`);
  console.log(`Codex CLI: ${cliTools.codex.status}${cliTools.codex.version ? ` ${cliTools.codex.version}` : ''}`);
  console.log(`Zellij: ${cliTools.zellij.ok ? 'ok' : cliTools.zellij.repair.status}${cliTools.zellij.version ? ` ${cliTools.zellij.version}` : ''}`);
  for (const file of result.created) console.log(`- ${file}`);
}

export async function bootstrapCommand(args: any = []) {
  return setupCommand(['--local-only', ...args]);
}

export async function initCommand(args: any = []) {
  return setupCommand(args);
}

export async function fixPathCommand(args: any = []) {
  const root = await projectRoot();
  const installScope = installScopeFromArgs(args);
  await withSecretPreservationGuard(root, 'fix-path-command', async () => {
    await initProject(root, { installScope, localOnly: flag(args, '--local-only'), globalCommand: 'sks', force: true });
  });
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

export async function depsCommand(sub: any = 'check', args: any = []) {
  const action = sub || 'check';
  if (action !== 'check' && action !== 'status') {
    console.error('Usage: sks deps check [--json] [--yes]');
    process.exitCode = 1;
    return;
  }
  const npm = whichSync('npm');
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  const root = await sksRoot();
  const { ensureRelatedCliTools } = await import('../../cli/install-helpers.js');
  const repairRequested = flag(args, '--yes') || flag(args, '-y');
  const cliTools = await ensureRelatedCliTools(repairRequested ? args : [...args, '--dry-run']);
  const zellijReady = cliTools.zellij.ok === true;
  const codexReady = cliTools.codex.status === 'present' || cliTools.codex.status === 'installed';
  const result = {
    schema: 'sks.deps-status.v1',
    root,
    ready: Boolean(nodeOk && npm && codexReady && zellijReady),
    node: { ok: nodeOk, version: process.version },
    npm: { ok: Boolean(npm), bin: npm },
    cli_tools: cliTools,
    next_actions: [
      ...(!nodeOk ? ['Install Node.js 20.11+.'] : []),
      ...(!npm ? ['Install npm or a Node.js distribution that includes npm.'] : []),
      ...(!codexReady ? [`Run sks deps check --yes or npm i -g @openai/codex@latest.`] : []),
      ...(!zellijReady ? [`Run sks deps check --yes or ${cliTools.zellij.install_hint || 'install Zellij'}.`] : [])
    ]
  };
  if (flag(args, '--json')) return printJson(result);
  console.log('SKS Dependencies');
  console.log(`Node: ${result.node.ok ? 'ok' : 'missing'} ${result.node.version}`);
  console.log(`npm:  ${result.npm.ok ? 'ok' : 'missing'} ${result.npm.bin || ''}`.trim());
  console.log(`Codex CLI: ${cliTools.codex.status}${cliTools.codex.version ? ` ${cliTools.codex.version}` : ''}`);
  console.log(`Zellij: ${zellijReady ? 'ok' : cliTools.zellij.repair.status}${cliTools.zellij.version ? ` ${cliTools.zellij.version}` : ''}`);
  for (const action of result.next_actions) console.log(`Next: ${action}`);
  if (!result.ready) process.exitCode = 1;
}

export async function postinstallCommand(args: any = []) {
  const { postinstall } = await import('../../cli/install-helpers.js');
  return postinstall({ bootstrap: bootstrapCommand, args });
}

export async function selftestCommand(args: any = []) {
  process.env.CI = 'true';
  const root = await projectRoot();
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-selftest-'));
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

export async function reasoningCommand(args: any = []) {
  const prompt = args.filter((arg: any) => !String(arg).startsWith('--')).join(' ').trim();
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

export async function tmuxCommand(sub: any = 'check', args: any = []) {
  const result = {
    schema: 'sks.removed-runtime.v1',
    ok: false,
    runtime: 'tmux',
    status: 'removed_runtime',
    replacement: 'zellij',
    subcommand: sub || 'check',
    operator_actions: ['Use `npm run zellij:capability` or `sks --mad` for the Zellij runtime.']
  };
  if (flag(args, '--json')) return printJson(result);
  console.error('tmux runtime has been removed from SKS. Use Zellij instead.');
  for (const action of result.operator_actions) console.error(`- ${action}`);
  process.exitCode = 2;
}

export async function autoReviewCommand(sub: any = 'status', args: any = []) {
  const { autoReviewStatus, enableAutoReview, disableAutoReview } = await import('../auto-review.js');
  const { writeRouteCollaborationArtifacts } = await import('../agents/route-collaboration-ledger.js');
  const action = sub || 'status';
  const result = action === 'fixture'
    ? await reviewNativeAgentFixture()
    : action === 'enable' || action === 'start'
    ? await enableAutoReview({ high: flag(args, '--high') })
    : action === 'disable'
      ? await disableAutoReview()
      : await autoReviewStatus();
  if (flag(args, '--json')) return printJson(result);
  console.log(JSON.stringify(result, null, 2));

  async function reviewNativeAgentFixture() {
    const root = await projectRoot();
    const { id } = await createMission(root, { mode: 'review', prompt: 'Review native agent collaboration fixture' });
    const native = await writeRouteCollaborationArtifacts(root, {
      missionId: id,
      route: '$Review',
      routeKey: 'Review',
      prompt: 'Review route approval safety, verification, and integration through the native agent runtime.',
      mode: 'REVIEW'
    });
    return {
      schema: 'sks.review-native-agent-fixture.v1',
      ok: native.ok,
      mission_id: id,
      native_agent_collaboration: native
    };
  }
}

function commandRows(): CommandRow[] {
  const registry = new Map<string, CommandEntry>(Object.entries(COMMANDS) as Array<[string, CommandEntry]>);
  return COMMAND_CATALOG.map((entry) => ({
    name: entry.name,
    usage: entry.usage,
    description: entry.description,
    maturity: registry.get(entry.name)?.maturity || 'labs'
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function installScopeFromArgs(args: any = [], fallback: any = 'global') {
  if (flag(args, '--project')) return 'project';
  if (flag(args, '--global')) return 'global';
  const index = args.indexOf('--install-scope');
  return normalizeInstallScope(index >= 0 && args[index + 1] ? args[index + 1] : fallback);
}

function whichSync(command: any) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'command', process.platform === 'win32' ? [command] : ['-v', command], {
    encoding: 'utf8',
    shell: process.platform !== 'win32'
  });
  return result.status === 0 ? String(result.stdout || '').trim().split(/\r?\n/)[0] : null;
}

function valueAfter(args: any[] = [], name: string): string | null {
  const index = args.findIndex((arg: any) => String(arg) === name);
  if (index < 0) return null;
  const value = args[index + 1];
  return value === undefined ? null : String(value);
}
