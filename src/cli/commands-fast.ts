import { COMMAND_MANIFEST_LITE, type CommandManifestLiteEntry } from './command-manifest-lite.js';

interface FastCommandRow {
  name: string;
  usage: string;
  description: string;
  maturity: CommandManifestLiteEntry['maturity'];
  readonly?: boolean;
  mutating?: boolean;
  deprecated?: boolean;
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

function fastCommandRow(entry: CommandManifestLiteEntry): FastCommandRow {
  const row: FastCommandRow = {
    name: entry.name,
    usage: `sks ${entry.name}`,
    description: entry.summary,
    maturity: entry.maturity
  };
  if (entry.readonly === true) row.readonly = true;
  if (entry.mutatesRouteState === true) row.mutating = true;
  if (entry.deprecated === true) row.deprecated = true;
  if (entry.hidden === true) row.hidden = true;
  return row;
}
