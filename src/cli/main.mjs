#!/usr/bin/env node
import { dispatch } from './router.mjs';

export async function main(args = process.argv.slice(2)) {
  return dispatch(args);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dispatch(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || String(err));
    process.exitCode = 1;
  });
}
