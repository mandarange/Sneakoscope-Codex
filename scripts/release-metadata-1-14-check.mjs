#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.mjs';

const RELEASE_VERSION = '1.14.0';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requiredDocs = [
  'README.md',
  'CHANGELOG.md',
  'docs/release-readiness.md',
  'docs/official-docs-compat.md',
  'docs/ux-review.md',
  'docs/ppt-imagegen-review.md',
  'docs/dfix.md',
  'docs/all-feature-completion.md',
  'docs/performance-budgets.md',
  'docs/wrongness-learning-loop.md',
  'docs/hooks-pat.md'
];
const requiredScripts = [
  'dfix:fast-kernel',
  'dfix:blackbox-fast',
  'dfix:performance',
  'dfix:patch-handoff',
  'dfix:verification-recommendation',
  'dfix:fixture',
  'dfix:verification',
  'hooks:latest-schema-check',
  'hooks:trust-state-check',
  'hooks:trust-warning-zero',
  'hooks:subagent-events-check',
  'hooks:no-unsupported-handlers',
  'hooks:actual-parity-check',
  'hooks:official-hash-parity',
  'hooks:managed-install-fixture',
  'hooks:runtime-replay-warning-zero',
  'imagegen:capability',
  'imagegen:gpt-image-2-request-validator',
  'ux-review:imagegen-blackbox',
  'ppt:imagegen-blackbox',
  'ux-ppt:structured-extraction',
  'hooks:codex-validate',
  'hooks:warning-check',
  'hooks:semantic-check',
  'hooks:strict-subset-check',
  'all-features:deep-completion',
  'all-features:completion',
  'evidence:flagship-coverage',
  'json-schema:recursive-check'
];

assertGate(pkg.version === RELEASE_VERSION, `package.json version must be ${RELEASE_VERSION}`, { version: pkg.version });
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const file of requiredDocs) {
  const absolute = path.join(root, file);
  assertGate(fs.existsSync(absolute), `missing release doc: ${file}`);
if (['README.md', 'CHANGELOG.md', 'docs/release-readiness.md', 'docs/official-docs-compat.md', 'docs/dfix.md', 'docs/performance-budgets.md', 'docs/wrongness-learning-loop.md', 'docs/hooks-pat.md'].includes(file)) {
    assertGate(fs.readFileSync(absolute, 'utf8').includes(RELEASE_VERSION), `release doc does not mention ${RELEASE_VERSION}: ${file}`);
  }
}

emitGate('release:metadata', { version: pkg.version, scripts: requiredScripts.length, docs: requiredDocs.length });
