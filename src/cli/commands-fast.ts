import { COMMAND_MANIFEST_LITE, visibleCommandManifest, type CommandManifestLiteEntry } from './command-manifest-lite.js';
import { sksTextLogo } from './output.js';

interface FastCommandRow {
  name: string;
  usage: string;
  description: string;
  maturity: CommandManifestLiteEntry['maturity'];
  readonly?: boolean;
  mutating?: boolean;
  hidden?: boolean;
}

export function commandsJsonFast(): void {
  const commands = COMMAND_MANIFEST_LITE
    .map((entry) => fastCommandRow(entry))
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log(JSON.stringify({
    schema: 'sks.command-registry.v1',
    aliases: ['sks', 'sneakoscope'],
    commands
  }, null, 2));
}

export function commandsTextFast(): void {
  const commands = visibleCommandManifest();
  console.log(`${sksTextLogo()}\n\nCommands\n`);
  const width = Math.max(...commands.map((entry) => entry.name.length)) + 2;
  for (const entry of commands) console.log(`sks ${entry.name.padEnd(width)}${entry.summary}`);
  console.log('\nRun `sks help <command>` for its usage.');
}

function fastCommandRow(entry: CommandManifestLiteEntry): FastCommandRow {
  const row: FastCommandRow = {
    name: entry.name,
    usage: entry.usage || `sks ${entry.name}`,
    description: entry.summary,
    maturity: entry.maturity
  };
  if (entry.readonly === true) row.readonly = true;
  if (entry.mutatesRouteState === true) row.mutating = true;
  if (entry.hidden === true) row.hidden = true;
  return row;
}
