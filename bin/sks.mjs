#!/usr/bin/env node

const FAST_PACKAGE_VERSION = '1.0.0';
const args = process.argv.slice(2);

try {
  if (args[0] === '--version' || args[0] === '-v' || args[0] === 'version') {
    console.log(`sneakoscope ${FAST_PACKAGE_VERSION}`);
  } else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    if (args.length > 1) {
      const { helpCommand } = await import('../src/core/commands/basic-cli.mjs');
      await helpCommand(args.slice(1));
    } else {
      const { helpFast } = await import('../src/cli/help-fast.mjs');
      helpFast();
    }
  } else {
    const { main } = await import('../src/cli/main.mjs');
    await main(args);
  }
} catch (err) {
  const message = err && err.stack ? err.stack : String(err);
  console.error(message);
  process.exitCode = 1;
}
