import { COMMANDS } from '../cli/command-registry.mjs';
import { flag } from '../cli/args.mjs';
import { printJson, sksTextLogo } from '../cli/output.mjs';

const FALLBACK_CATALOG = [
  { name: 'help', usage: 'sks help [stable|beta|labs|all]', description: 'Show concise SKS help.' },
  { name: 'version', usage: 'sks version | sks --version', description: 'Print the installed version.' },
  { name: 'commands', usage: 'sks commands [--json]', description: 'List the command registry.' },
  { name: 'root', usage: 'sks root [--json]', description: 'Show the active SKS root.' },
  { name: 'doctor', usage: 'sks doctor [--json]', description: 'Check local SKS readiness.' },
  { name: 'features', usage: 'sks features check --json', description: 'Validate feature coverage and fixtures.' },
  { name: 'all-features', usage: 'sks all-features selftest --mock --json', description: 'Run mock feature fixture checks.' },
  { name: 'proof', usage: 'sks proof show|validate|latest|export [--json|--md]', description: 'Inspect completion proof.' },
  { name: 'wiki', usage: 'sks wiki image-ingest|image-validate|image-summary ...', description: 'Manage TriWiki and image voxel ledgers.' },
  { name: 'hooks', usage: 'sks hooks explain|status|trust-report|replay ...', description: 'Inspect Codex hook policy and trust evidence.' },
  { name: 'codex-lb', usage: 'sks codex-lb status|metrics|doctor|circuit ...', description: 'Inspect codex-lb readiness and circuit state.' },
  { name: 'perf', usage: 'sks perf cold-start --json', description: 'Measure CLI cold-start budgets.' },
  { name: 'team', usage: 'sks team "task"', description: 'Create and observe Team missions.' },
  { name: 'qa-loop', usage: 'sks qa-loop prepare|run|status ...', description: 'Run QA loop missions.' },
  { name: 'research', usage: 'sks research prepare|run|status ...', description: 'Run research missions.' },
  { name: 'ppt', usage: 'sks ppt build|status ...', description: 'Build or inspect PPT route artifacts.' },
  { name: 'image-ux-review', usage: 'sks image-ux-review status ...', description: 'Inspect image UX review artifacts.' },
  { name: 'db', usage: 'sks db policy|scan|check ...', description: 'Inspect database safety policy.' },
  { name: 'gx', usage: 'sks gx init|render|validate|drift|snapshot ...', description: 'Create and verify visual context cartridges.' },
  { name: 'goal', usage: 'sks goal create|status|pause|resume|clear ...', description: 'Manage the Goal bridge.' }
];

export async function run(command, args = []) {
  if (command === 'commands') return commands(args);
  const topic = args[0];
  if (topic === 'all') return printHelp('all');
  if (['stable', 'beta', 'labs'].includes(topic)) return printHelp(topic);
  if (topic) return printTopic(topic);
  return printHelp('default');
}

function commands(args = []) {
  const commands = commandRows('all');
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

function printHelp(filter) {
  const rows = commandRows(filter === 'default' ? 'stable-beta' : filter);
  console.log(`${sksTextLogo()}\n\nUsage\n`);
  console.log('  sks help [stable|beta|labs|all]');
  console.log('  sks commands [--json]');
  console.log('  sks root [--json]');
  console.log('  sks proof show --json');
  console.log('');
  for (const row of rows) console.log(`  ${row.usage.padEnd(54)} ${row.description}`);
  console.log('\nCore promises: image-based Voxel TriWiki, Codex App/codex-lb readiness, and completion proof for serious routes.');
}

function printTopic(topic) {
  const row = commandRows('all').find((entry) => entry.name === topic);
  if (!row) return printHelp('default');
  console.log(`${sksTextLogo()}\n\n${row.name}\n`);
  console.log(`Usage: ${row.usage}`);
  console.log(row.description);
}

function commandRows(filter) {
  const maturityByName = new Map(Object.entries(COMMANDS).map(([name, meta]) => [name, meta.maturity || 'labs']));
  const rows = FALLBACK_CATALOG.map((entry) => ({ ...entry, maturity: maturityByName.get(entry.name) || 'labs' }));
  if (filter === 'all') return rows;
  if (filter === 'stable-beta') return rows.filter((row) => row.maturity === 'stable' || row.maturity === 'beta');
  return rows.filter((row) => row.maturity === filter);
}
