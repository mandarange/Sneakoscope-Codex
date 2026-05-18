#!/usr/bin/env node
import { rustCommand } from '../dist/core/commands/rust-command.js';

await rustCommand(['smoke', '--json', ...process.argv.slice(2)]);
