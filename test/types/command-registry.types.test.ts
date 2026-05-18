import {
  TYPED_COMMANDS,
  typedCommandNames,
  type CommandEntry,
  type CommandModule,
  type CommandName
} from '../../src/cli/command-registry.js';

type Assert<T extends true> = T;

type CommandNameIsClosed = Assert<string extends CommandName ? false : true>;
type CommandModuleRunIsTyped = Assert<CommandModule['run'] extends (command: string, args: string[]) => unknown ? true : false>;

const helpEntry: CommandEntry = TYPED_COMMANDS.help;
const firstCommand: CommandName = typedCommandNames()[0] ?? 'help';
const packageFiles: readonly string[] | undefined = helpEntry.packageRequiredFiles;

void firstCommand;
void packageFiles;
void (null as unknown as CommandNameIsClosed);
void (null as unknown as CommandModuleRunIsTyped);
