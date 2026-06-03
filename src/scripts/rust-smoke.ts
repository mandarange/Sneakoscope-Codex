#!/usr/bin/env node
// @ts-nocheck
import { rustCommand } from '../core/commands/rust-command.js';

await rustCommand(['smoke', '--json', ...process.argv.slice(2)]);
