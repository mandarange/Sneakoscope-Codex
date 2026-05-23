#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDistFreshStamp, sourceSnapshot } from './lib/ensure-dist-fresh.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const distRoot = path.join(root, 'dist');

if (!fs.existsSync(distRoot)) {
  throw new Error('dist directory does not exist; run npm run build first');
}

const files = [];
await collect(distRoot, files);

const sorted = files.sort();
const mjsRuntime = sorted.filter((f) => f.endsWith('.mjs')).length;
const source = sourceSnapshot();
const distStamp = writeDistFreshStamp();

await fsp.writeFile(
  path.join(distRoot, 'build-manifest.json'),
  `${JSON.stringify(
    {
      schema: 'sks.dist-build.v2',
      version: pkg.version,
      package_version: pkg.version,
      typescript: true,
      mjs_runtime_files: mjsRuntime,
      source_digest: source.digest,
      source_file_count: source.file_count,
      dist_stamp_schema: distStamp.schema,
      files: sorted,
    },
    null,
    2,
  )}\n`,
);

async function collect(dir, out) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file, out);
    else if (entry.isFile()) out.push(path.relative(distRoot, file).split(path.sep).join('/'));
  }
}
