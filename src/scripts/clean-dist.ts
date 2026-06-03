#!/usr/bin/env node
// @ts-nocheck
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
await fsp.rm(path.join(root, 'dist'), { recursive: true, force: true });
