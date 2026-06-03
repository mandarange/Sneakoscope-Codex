#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const configPath = path.join(process.cwd(), '.codex', 'config.toml');
const outputLastMessage = readOption('--output-last-message', '');

try {
  fs.readFileSync(configPath, 'utf8');
} catch (err) {
  emitConfigError(`Failed to read project config file ${configPath}: ${err.message}`);
}

if (process.env.SKS_FAKE_CODEX_CONFIG_EPERM === '1') {
  emitConfigError(`Failed to read project config file ${configPath}: Operation not permitted (os error 1)`);
}

if (process.env.SKS_FAKE_CODEX_CONFIG_TOML_ERROR === '1') {
  emitConfigError(`TOML parse error in project config file ${configPath}: invalid string`);
}

if (process.env.SKS_FAKE_CODEX_CONFIG_IGNORED_PROJECT_KEY === '1') {
  process.stderr.write(`warning: Ignored unsupported project-local config keys in ${configPath}: model_provider, model_providers, profiles. If you want these settings to apply, manually set them in your user-level config.toml.\n`);
}

if (outputLastMessage) {
  fs.mkdirSync(path.dirname(outputLastMessage), { recursive: true });
  fs.writeFileSync(outputLastMessage, `${JSON.stringify({
    ok: true,
    source: 'fake-codex-config-loader',
    message: 'SKS_CONFIG_LOAD_PROBE_OK'
  })}\n`);
}

process.stdout.write('SKS_CONFIG_LOAD_PROBE_OK\n');

function emitConfigError(message) {
  process.stderr.write(`Error loading config.toml:\n${message}\n`);
  process.exit(1);
}

function readOption(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
