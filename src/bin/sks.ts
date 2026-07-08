#!/usr/bin/env node

const FAST_PACKAGE_VERSION = '5.11.0';
const firstArg = process.argv[2];

if (firstArg === '--version' || firstArg === '-v' || firstArg === 'version') {
  process.stdout.write(`sneakoscope ${FAST_PACKAGE_VERSION}\n`);
} else {
  import('./sks-dispatch.js').then(({ runSks }) => runSks(process.argv.slice(2))).catch((err: unknown) => {
    const message = err instanceof Error && err.stack ? err.stack : String(err);
    console.error(message);
    process.exitCode = 1;
  });
}
