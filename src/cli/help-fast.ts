// @ts-nocheck
import { COMMANDS } from './command-registry.js';
import { PACKAGE_VERSION } from '../core/version.js';
import { COMMAND_CATALOG } from '../core/routes.js';

export function helpFast() {
  console.log(`SKS
SNEAKOSCOPE CODEX v${PACKAGE_VERSION}

Usage

  sks
  sks help [topic]
  sks commands [--json]
  sks dollar-commands [--json]
  sks proof show --json
`);
  for (const row of commandRows().filter((entry) => entry.maturity !== 'labs')) {
    console.log(`  ${row.usage.padEnd(58)} ${row.description}`);
  }
  console.log('\nThree core promises: Completion Proof for serious routes, Image Voxel TriWiki for visual routes, and release-gated Codex App/codex-lb/hooks/Rust evidence.');
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
