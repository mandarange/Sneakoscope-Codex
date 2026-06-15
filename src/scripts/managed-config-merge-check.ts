#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { writeManagedEnvConfig, writeManagedJsonConfig, writeManagedTomlConfig } from '../core/config/managed-config-merge.js';

const root = await makeTempRoot('sks-managed-merge-');
const envFile = path.join(root, '.env.local');
await writeText(envFile, 'NEXT_PUBLIC_SUPABASE_ANON_KEY=keep-me\n');
await writeManagedEnvConfig(envFile, await fs.readFile(envFile, 'utf8'), ['SKS_MANAGED=1', 'NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-me']);
const envText = await fs.readFile(envFile, 'utf8');
const tomlFile = path.join(root, '.codex', 'config.toml');
const toml = await writeManagedTomlConfig(tomlFile, '[mcp.supabase]\ntoken = "keep-token"\n', ['[mcp.supabase]\nurl = "https://example.supabase.co"']);
const json = await writeManagedJsonConfig(path.join(root, '.sneakoscope', 'config.json'), { supabase: { anon_key: 'keep-json' } }, { supabase: { anon_key: 'replace-json', url: 'x' } });
assertGate(envText.includes('keep-me') && !envText.includes('replace-me'), 'env merge must preserve protected secret line', envText);
assertGate(toml.ok && json.ok, 'managed config merge results must be ok', { toml, json });
emitGate('config:managed-merge');
