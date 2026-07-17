import { COMMAND_MANIFEST_LITE } from './command-manifest-lite.js';
import { PACKAGE_VERSION } from '../core/version.js';

export function helpFast() {
  console.log(`SKS
SNEAKOSCOPE CODEX v${PACKAGE_VERSION}

3-pillar frontdoor

  $sks-plan "task"          plan only; writes .sneakoscope/plans, no code edits
  $sks-work                 execute the latest plan with evidence gates

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
  return COMMAND_MANIFEST_LITE.map((entry) => ({
    name: entry.name,
    usage: `sks ${entry.name}`,
    description: entry.summary,
    maturity: entry.maturity
  })).sort((a: any, b: any) => a.name.localeCompare(b.name));
}
