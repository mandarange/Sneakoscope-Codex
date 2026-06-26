#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '');
const isPrerelease = version.includes('-');
const publishLifecycle = process.env.npm_lifecycle_event === 'prepublishOnly';
const npmTag = process.env.npm_config_tag || process.env.NPM_CONFIG_TAG || '';
const publishConfigTag = pkg.publishConfig?.tag || '';
const npmrcTag = readRootNpmrcTag();
const configuredTag = publishLifecycle && (!npmTag || npmTag === 'latest')
  ? (npmrcTag || publishConfigTag || npmTag || 'latest')
  : (npmTag || npmrcTag || publishConfigTag || 'latest');
const isBackfill = !isPrerelease && /^backfill(?:[-_][a-z0-9.-]+)?$/i.test(configuredTag);
const expectedTag = isPrerelease ? 'rc' : isBackfill ? configuredTag : 'latest';

if (publishConfigTag && npmrcTag && publishConfigTag !== npmrcTag) {
  console.error('package.json publishConfig.tag and root .npmrc tag disagree.');
  console.error(`publishConfig.tag: ${publishConfigTag}`);
  console.error(`.npmrc tag: ${npmrcTag}`);
  process.exit(2);
}

if (publishConfigTag && /^backfill(?:[-_][a-z0-9.-]+)?$/i.test(publishConfigTag) && !npmrcTag && !npmTag) {
  console.error('Backfill releases must set root .npmrc tag so `npm publish --ignore-scripts` does not use latest.');
  console.error(`Expected .npmrc: tag=${publishConfigTag}`);
  process.exit(2);
}

if (configuredTag !== expectedTag) {
  if (isPrerelease) {
    console.error(`Prerelease ${pkg.name}@${version} must be published with the rc dist-tag.`);
    console.error('Set package.json publishConfig.tag to rc or pass `--tag rc` to npm publish.');
  } else {
    console.error(`Stable release ${pkg.name}@${version} must be published with the latest dist-tag unless it is an explicit backfill.`);
    console.error('Use latest for forward releases, or a backfill-* publishConfig.tag for intentional unpublished lower-version backfills.');
  }
  console.error(`Current npm tag config: ${configuredTag || 'missing'}`);
  process.exit(2);
}

console.log(`Publish tag check passed: ${pkg.name}@${version} -> ${configuredTag}`);

function readRootNpmrcTag(): string {
  const npmrcPath = path.join(root, '.npmrc');
  if (!fs.existsSync(npmrcPath)) return '';
  const text = fs.readFileSync(npmrcPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const match = trimmed.match(/^tag\s*=\s*(.+)$/);
    if (match) return String(match[1] || '').trim();
  }
  return '';
}
