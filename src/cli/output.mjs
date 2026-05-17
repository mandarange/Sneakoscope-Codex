import { PACKAGE_VERSION } from '../core/version.mjs';

export function sksTextLogo() {
  return `SKS\nSNEAKOSCOPE CODEX v${PACKAGE_VERSION}`;
}

export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
