#!/usr/bin/env node
import { rustCommand } from '../src/core/commands/rust-command.mjs';

await rustCommand(['smoke', '--json', ...process.argv.slice(2)]);
