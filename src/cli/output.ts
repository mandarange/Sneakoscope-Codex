import { PACKAGE_VERSION } from '../core/version.js';

export function sksTextLogo() {
  return `SKS\nSNEAKOSCOPE CODEX v${PACKAGE_VERSION}`;
}

export function printJson(value: any) {
  console.log(JSON.stringify(value, null, 2));
}
