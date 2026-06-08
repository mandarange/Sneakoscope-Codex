#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

assertGate(readText('src/cli/command-registry.ts').includes("'mad-db'"), 'mad-db command must be registered')
assertGate(readText('src/commands/mad-db.ts').includes('madDbCommand'), 'mad-db command wrapper missing')
assertGate(readText('src/core/commands/mad-db-command.ts').includes('I AUTHORIZE ONE-CYCLE DB BREAK-GLASS'), 'mad-db command must require exact ack phrase')
emitGate('mad-db:command', { command: 'sks mad-db' })
