import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../fsx.js';

export const CODEX_RUNTIME_CONTRACT_SCHEMA = 'sks.codex-runtime-contract.v3' as const;

/**
 * Oldest Codex CLI release SKS runs against.
 *
 * A literal on purpose: it moves when SKS stops supporting an older Codex, not when the bundled
 * `@openai/codex-sdk` pin moves. It must stay at or below that pin because the bundled runtime has
 * to pass it (the contract test pins this). Raising the floor is a one-line change here.
 */
export const CODEX_MIN_VERSION = '0.153.4';

export interface CodexRuntimeContract {
  readonly schema: typeof CODEX_RUNTIME_CONTRACT_SCHEMA;
  /** Release tag of the bundled runtime (the SDK pin), not a support requirement. */
  readonly targetTag: string;
  /** Exact `@openai/codex-sdk` dependency; the bundled Codex runtime resolves to the same version. */
  readonly sdkVersion: string;
  /** Support floor; see CODEX_MIN_VERSION. */
  readonly minVersion: string;
  readonly dependencySource: 'package.json#dependencies.@openai/codex-sdk';
}

const sdkVersion = codexSdkDependencyVersion();

export const CURRENT_CODEX_RUNTIME_CONTRACT: CodexRuntimeContract = {
  schema: CODEX_RUNTIME_CONTRACT_SCHEMA,
  targetTag: `rust-v${sdkVersion}`,
  sdkVersion,
  minVersion: CODEX_MIN_VERSION,
  dependencySource: 'package.json#dependencies.@openai/codex-sdk'
};

export function codexSdkDependencyVersion(root = packageRoot()): string {
  const packagePath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const value = String(pkg.dependencies?.['@openai/codex-sdk'] || '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error(`@openai/codex-sdk must be an exact semver in ${packagePath}`);
  }
  return value;
}
