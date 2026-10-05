// @ts-nocheck
// Checkout-only helper for gate scripts that need a maintainer command. Kept out
// of sks-cli-gate-lib so the installed package's script closure never references
// the maintainer CLI.
import path from 'node:path';
import { root, runEntrypointJson } from './sks-cli-gate-lib.js';

export function runMaintainerJson(args, options = {}) {
  return runEntrypointJson(path.join(root, 'dist', 'scripts', 'maintainer-cli.js'), args, options);
}
