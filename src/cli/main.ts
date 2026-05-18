#!/usr/bin/env node
// @ts-nocheck
import { dispatch } from './router.js';

export async function main(args = process.argv.slice(2)) {
  return dispatch(args);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dispatch(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || String(err));
    process.exitCode = 1;
  });
}
