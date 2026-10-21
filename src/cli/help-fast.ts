import { visibleCommandManifest } from './command-manifest-lite.js';
import { PACKAGE_VERSION } from '../core/version.js';

export function helpFast() {
  console.log(`SKS
SNEAKOSCOPE CODEX v${PACKAGE_VERSION}

Ask Codex for work directly; the main agent does ordinary work and SKS hooks keep it safe.

  $sks-plan "task"          plan only; writes .sneakoscope/plans, no code edits
  $sks-work                 execute the latest plan with Naruto child agents

  sks review --staged       machine-first diff review
  sks doctor --fix          repair and validate the install
  sks help <command>        usage of one command (or a $ route)
  sks dollar-commands       every Codex App $ route

Commands
`);
  const commands = visibleCommandManifest().filter((entry) => entry.maturity !== 'labs');
  const width = Math.max(...commands.map((entry) => entry.name.length)) + 2;
  for (const entry of commands) console.log(`  sks ${entry.name.padEnd(width)}${entry.summary}`);
  console.log('\nLabs commands (optional routes) are listed by `sks commands`.');
}
