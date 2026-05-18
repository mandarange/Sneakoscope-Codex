#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '');
const isPrerelease = version.includes('-');
const publishLifecycle = process.env.npm_lifecycle_event === 'prepublishOnly';
const npmTag = process.env.npm_config_tag || process.env.NPM_CONFIG_TAG || '';
const publishConfigTag = pkg.publishConfig?.tag || '';
const configuredTag = publishLifecycle && (!npmTag || npmTag === 'latest')
  ? (publishConfigTag || npmTag || 'latest')
  : (npmTag || publishConfigTag || 'latest');
const expectedTag = isPrerelease ? 'rc' : 'latest';

if (configuredTag !== expectedTag) {
  if (isPrerelease) {
    console.error(`Prerelease ${pkg.name}@${version} must be published with the rc dist-tag.`);
    console.error('Set package.json publishConfig.tag to rc or pass `--tag rc` to npm publish.');
  } else {
    console.error(`Stable release ${pkg.name}@${version} must be published with the latest dist-tag.`);
    console.error('Remove prerelease tag config and use plain `npm publish`.');
  }
  console.error(`Current npm tag config: ${configuredTag || 'missing'}`);
  process.exit(2);
}

console.log(`Publish tag check passed: ${pkg.name}@${version} -> ${configuredTag}`);
