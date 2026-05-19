#!/usr/bin/env node
import { dispatch } from './router.js';

export async function main(args?: readonly string[]): Promise<unknown> {
  return dispatch(args ?? process.argv.slice(2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dispatch(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exitCode = 1;
  });
}
