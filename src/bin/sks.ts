#!/usr/bin/env node

const FAST_PACKAGE_VERSION = '1.19.0';
const args = process.argv.slice(2);

try {
  if (args[0] === '--agent' && args[1] === 'worker') {
    const { runNativeCliWorkerFromArgs } = await import('../core/agents/native-cli-worker.js');
    await runNativeCliWorkerFromArgs(args.slice(2));
  } else if (args[0] === '--version' || args[0] === '-v' || args[0] === 'version') {
    console.log(`sneakoscope ${FAST_PACKAGE_VERSION}`);
  } else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    if (args.length > 1) {
      const { helpCommand } = await import('../core/commands/basic-cli.js');
      await (helpCommand as (args: string[]) => Promise<unknown> | unknown)(args.slice(1));
    } else {
      const { helpFast } = await import('../cli/help-fast.js');
      helpFast();
    }
  } else {
    const { main } = await import('../cli/main.js');
    await main(args);
  }
} catch (err: unknown) {
  const message = err instanceof Error && err.stack ? err.stack : String(err);
  console.error(message);
  process.exitCode = 1;
}
