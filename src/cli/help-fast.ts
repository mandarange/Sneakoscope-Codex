import { COMMANDS } from './command-registry.js';
import { PACKAGE_VERSION } from '../core/version.js';
import { COMMAND_CATALOG } from '../core/routes.js';

export function helpFast() {
  console.log(`SKS
SNEAKOSCOPE CODEX v${PACKAGE_VERSION}

3-pillar frontdoor

  $Plan "task"              plan only; writes .sneakoscope/plans, no code edits
  $Work                     execute the latest plan with evidence gates
  $Swarm "task"             dynamic Naruto swarm with machine verification

Local surfaces

  sks ui                    localhost live dashboard
  sks review --staged       machine-first diff review
  sks doctor --fix          repair/validate the harness

Discovery

  sks commands [--json]     all commands
  sks dollar-commands       all Codex App $ routes
  sks help [topic]          focused help
`);
  for (const row of commandRows().filter((entry: any) => entry.maturity !== 'labs').slice(0, 18)) {
    console.log(`  ${row.usage.padEnd(58)} ${row.description}`);
  }
  console.log('\nRun `sks commands` for the full catalog. Core promise: machine-verified completion, not vibes.');
}

function commandRows() {
  const registry = new Map(Object.entries(COMMANDS).map(([name, meta]: any) => [name, meta]));
  return COMMAND_CATALOG.map((entry: any) => ({
    name: entry.name,
    usage: entry.usage,
    description: entry.description,
    maturity: registry.get(entry.name)?.maturity || entry.maturity || 'labs'
  })).sort((a: any, b: any) => a.name.localeCompare(b.name));
}
