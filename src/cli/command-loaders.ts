/** Lazy command-module loaders shared by the shipped registry and the maintainer CLI. */

export type CommandRun = (command: string, args: string[]) => Promise<unknown> | unknown;
export type ArgsRun = (args: string[]) => Promise<unknown> | unknown;
export type SubcommandRun = (subcommand: string, args: string[]) => Promise<unknown> | unknown;
export type CommandArgsRun = (command: string, args: string[]) => Promise<unknown> | unknown;

export interface CommandModule {
  run: CommandRun;
  /**
   * Optional richer usage text. The router prints this for `--help` instead of
   * the manifest-derived default, and never calls `run` for a help request.
   */
  usage?: (command: string) => string;
}

export interface CommandLoader {
  lazy: () => Promise<CommandModule>;
  packageRequiredFiles: readonly string[];
}

type CommandCallable = (...args: unknown[]) => Promise<unknown> | unknown;

/** Loaded ESM modules are unknown at the boundary; narrow before calling exports. */
function hasFunctionExport<K extends string>(
  mod: unknown,
  exportName: K
): mod is Record<K, CommandCallable> {
  if (!mod || typeof mod !== 'object') return false;
  const v = (mod as Record<string, unknown>)[exportName];
  return typeof v === 'function';
}

function functionExport<T>(mod: unknown, exportName: string): T {
  if (!hasFunctionExport(mod, exportName)) throw new Error(`Missing export ${exportName}`);
  return mod[exportName] as T;
}

/** Pick runner from default export object shape used by legacy command files. */
function pickRunner(mod: Record<string, unknown>): CommandCallable | null {
  for (const k of ['run', 'main', 'default'] as const) {
    const v = mod[k];
    if (typeof v === 'function') return v as CommandCallable;
  }
  return null;
}

/**
 * Every wrapper below builds a fresh CommandModule from one named export, which
 * silently dropped any `usage()` the module also exported — so the router's
 * "a command opts into richer help by exporting usage()" branch was unreachable
 * for every registered command. Carry it through when it is there.
 */
function usageOf(mod: unknown): { usage?: (command: string) => string } {
  const candidate = (mod as Record<string, unknown> | null)?.usage;
  return typeof candidate === 'function' ? { usage: candidate as (command: string) => string } : {};
}

function normalizeCommandModule(moduleValue: unknown): CommandModule {
  if (!moduleValue || typeof moduleValue !== 'object')
    throw new Error('Invalid command module');

  const rec = moduleValue as Record<string, unknown>;
  const runner = pickRunner(rec);
  if (!runner)
    throw new Error('Command module must export run/main/default callable');

  return {
    run: async (command: string, args: string[]) => runner(command, args) as unknown,
    ...usageOf(rec),
  } satisfies CommandModule;
}

export function directCommand<T extends { run?: CommandRun; main?: CommandRun; default?: CommandRun }>(
  loader: () => Promise<T>
): () => Promise<CommandModule> {
  return async () => normalizeCommandModule(await loader());
}

export function argsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<ArgsRun>(mod, exportName);
    return { run: (_command: string, args: string[]) => fn(args) as unknown, ...usageOf(mod) };
  };
}

export function noArgsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<() => Promise<unknown> | unknown>(mod, exportName);
    return { run: () => fn() as unknown, ...usageOf(mod) };
  };
}

export function commandArgsCommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<CommandArgsRun>(mod, exportName);
    return { run: (command: string, args: string[]) => fn(command, args) as unknown, ...usageOf(mod) };
  };
}

export function subcommand<T extends object, K extends keyof T & string>(
  loader: () => Promise<T>,
  exportName: K,
  fallbackSubcommand?: string
): () => Promise<CommandModule> {
  return async () => {
    const mod = await loader();
    const fn = functionExport<SubcommandRun>(mod, exportName);
    return {
      run: (_command: string, args: string[]) => {
        const [subcommandName = fallbackSubcommand, ...rest] = args;
        return fn(subcommandName ?? '', rest) as unknown;
      },
      ...usageOf(mod),
    };
  };
}

export function command(packageRequiredFile: string, lazy: () => Promise<CommandModule>): CommandLoader {
  return { lazy, packageRequiredFiles: [packageRequiredFile] };
}
