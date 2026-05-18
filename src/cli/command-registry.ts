export interface CommandModule {
  run(command: string, args: string[]): Promise<unknown> | unknown;
}

export interface CommandEntry {
  maturity: 'stable' | 'beta' | 'labs';
  summary: string;
  lazy: () => Promise<CommandModule>;
  packageRequiredFiles?: readonly string[];
}

function contractEntry(maturity: CommandEntry['maturity'], summary: string, modulePath: string): CommandEntry {
  return {
    maturity,
    summary,
    packageRequiredFiles: [modulePath],
    lazy: async () => ({
      run: () => ({ ok: true, contract_only: true, modulePath })
    })
  };
}

export const TYPED_COMMANDS = {
  help: contractEntry('stable', 'Show SKS help', 'dist/commands/help.mjs'),
  version: contractEntry('stable', 'Show SKS version', 'dist/commands/version.mjs'),
  commands: contractEntry('stable', 'List SKS commands', 'dist/core/commands/basic-cli.mjs'),
  run: contractEntry('beta', 'Classify and execute a task through the SKS trust kernel', 'dist/core/commands/run-command.mjs'),
  team: contractEntry('beta', 'Create and observe Team missions', 'dist/core/commands/team-command.mjs'),
  trust: contractEntry('beta', 'Report and validate route trust kernel evidence', 'dist/core/commands/trust-command.mjs'),
  proof: contractEntry('beta', 'Show and validate completion proof', 'dist/commands/proof.mjs'),
  scouts: contractEntry('beta', 'Run read-only scout intake', 'dist/commands/scouts.mjs'),
  db: contractEntry('beta', 'Inspect DB safety policy', 'dist/core/commands/db-command.mjs'),
  wiki: contractEntry('beta', 'Manage TriWiki and image voxel ledgers', 'dist/commands/wiki.mjs'),
  bench: contractEntry('beta', 'Run core trust-kernel benchmark budgets', 'dist/core/commands/bench-command.mjs'),
  features: contractEntry('beta', 'Validate feature registry', 'dist/commands/features.mjs')
} satisfies Record<string, CommandEntry>;

export type CommandName = keyof typeof TYPED_COMMANDS;

export function typedCommandNames(): CommandName[] {
  return Object.keys(TYPED_COMMANDS).sort() as CommandName[];
}

export function assertCommandModule(value: unknown): asserts value is CommandModule {
  if (!value || typeof value !== 'object' || typeof (value as Partial<CommandModule>).run !== 'function') {
    throw new Error('Command module must expose run(command, args)');
  }
}
