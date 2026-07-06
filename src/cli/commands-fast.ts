import { COMMANDS, type CommandEntry } from './command-registry.js';

interface FastCommandRow {
  name: string;
  usage: string;
  description: string;
  maturity: CommandEntry['maturity'];
}

export function commandsJsonFast(): void {
  const commands = Object.entries(COMMANDS)
    .map(([name, entry]) => fastCommandRow(name, entry))
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log(JSON.stringify({
    schema: 'sks.command-registry.v1',
    aliases: ['sks', 'sneakoscope'],
    commands
  }, null, 2));
}

function fastCommandRow(name: string, entry: CommandEntry): FastCommandRow {
  return {
    name,
    usage: `sks ${name}`,
    description: entry.summary,
    maturity: entry.maturity
  };
}
