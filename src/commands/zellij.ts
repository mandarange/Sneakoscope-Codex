import { projectRoot } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { checkZellijCapability } from '../core/zellij/zellij-capability.js';

export const ZELLIJ_COMMAND_SCHEMA = 'sks.zellij-command.v1';
export const ZELLIJ_REPAIR_SCHEMA = 'sks.zellij-repair.v1';

function installHint(): string {
  if (process.platform === 'darwin') return 'brew install zellij';
  if (process.platform === 'linux') return 'cargo install --locked zellij   # or your distro package, e.g. `apt install zellij` / `pacman -S zellij`';
  return 'See https://zellij.dev/documentation/installation';
}

export async function run(_command: string = 'zellij', args: string[] = []) {
  const sub = (args.find((arg) => !arg.startsWith('-')) || 'status').toLowerCase();
  const json = flag(args, '--json');
  const root = await projectRoot();
  if (sub === 'help') return printHelp(json);
  if (sub === 'repair') return zellijRepair(root, args, json);
  return zellijStatus(root, args, json);
}

async function zellijStatus(root: string, args: string[], json: boolean) {
  const requireReal = flag(args, '--require-real') || process.env.SKS_REQUIRE_ZELLIJ === '1';
  const capability = await checkZellijCapability({ root, require: requireReal });
  const status = capability.status || 'unknown';
  const ready = status === 'ok';
  const result = {
    schema: ZELLIJ_COMMAND_SCHEMA,
    subcommand: 'status',
    ok: ready || !requireReal,
    status,
    version: capability.version || null,
    required_for: ['sks --mad', 'sks team open-zellij', 'interactive lane UI'],
    blockers: capability.blockers || [],
    warnings: capability.warnings || [],
    install_hint: ready ? null : installHint(),
    next_actions: ready
      ? []
      : [`Install Zellij: ${installHint()}`, 'Then re-run `sks zellij status` and `sks doctor --fix`.']
  };
  if (json) {
    printJson(result);
  } else {
    console.log('SKS Zellij runtime');
    console.log(`  status:   ${status}${result.version ? ` (${result.version})` : ''}`);
    console.log(`  required: ${result.required_for.join(', ')}`);
    if (result.blockers.length) console.log(`  blockers: ${result.blockers.join(', ')}`);
    if (!ready) {
      console.log('  next:');
      for (const action of result.next_actions) console.log(`    - ${action}`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}

async function zellijRepair(root: string, args: string[], json: boolean) {
  // Explain-only by default: SKS never auto-installs Zellij (no Homebrew/cargo
  // side-effects from this command). It surfaces the exact operator steps.
  const capability = await checkZellijCapability({ root, require: false });
  const status = capability.status || 'unknown';
  const autoInstall = false;
  const result = {
    schema: ZELLIJ_REPAIR_SCHEMA,
    subcommand: 'repair',
    ok: true,
    mode: 'explain',
    status,
    auto_install: autoInstall,
    operator_actions: [
      `Install or upgrade Zellij: ${installHint()}`,
      'Verify: `sks zellij status` (or `npm run zellij:capability`).',
      'Opt-in dependency repair through SKS: `sks deps check --yes` or `sks bootstrap --yes`.',
      'Recover Codex config issues: `sks doctor --fix`.'
    ]
  };
  if (json) {
    printJson(result);
  } else {
    console.log('SKS Zellij repair (explain-only; no automatic install)');
    console.log(`  current status: ${status}`);
    for (const action of result.operator_actions) console.log(`  - ${action}`);
  }
}

function printHelp(json: boolean) {
  const result = {
    schema: ZELLIJ_COMMAND_SCHEMA,
    subcommand: 'help',
    ok: true,
    usage: 'sks zellij status|repair|capability [--require-real] [--json]',
    subcommands: {
      status: 'Report Zellij runtime capability and interactive-route readiness.',
      repair: 'Explain how to install/repair Zellij (no automatic install).',
      capability: 'Alias for status.'
    }
  };
  if (json) printJson(result);
  else {
    console.log('sks zellij — inspect and repair the Zellij interactive runtime');
    console.log('  sks zellij status [--require-real] [--json]');
    console.log('  sks zellij repair [--explain] [--json]');
  }
}
