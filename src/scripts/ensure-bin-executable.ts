#!/usr/bin/env node
// @ts-nocheck
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(root, 'dist', 'bin', 'sks.js');
await fsp.chmod(bin, 0o755);
console.log(`bin executable: ${path.relative(root, bin)}`);
