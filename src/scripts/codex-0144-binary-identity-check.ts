#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { CURRENT_CODEX_RELEASE_MANIFEST } from '../core/codex-compat/codex-release-manifest.js';
import { compareSemverLike } from '../core/codex-compat/codex-version-policy.js';
import { resolveCodexRuntime } from '../core/codex-runtime/resolve-codex-runtime.js';

const resolved = await resolveCodexRuntime({ requestedBy: 'codex-0144-binary-identity-check' });
assertGate(resolved.ok && resolved.identity !== null, 'Codex runtime identity must resolve', resolved);
const identity = resolved.identity!;
assertGate(
  compareSemverLike(identity.version, CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion) >= 0,
  `Codex runtime must satisfy ${CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion}`,
  identity
);
assertGate(identity.sha256.length === 64, 'Codex runtime identity must include SHA-256', identity);
emitGate('codex:0144:binary-identity', {
  realpath: identity.realpath,
  version: identity.version,
  sha256: identity.sha256,
  source: identity.source
});
