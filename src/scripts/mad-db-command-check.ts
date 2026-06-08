#!/usr/bin/env node
import { DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS, routeByDollarCommand } from '../core/routes.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

assertGate(readText('src/cli/command-registry.ts').includes("'mad-db'"), 'mad-db command must be registered')
assertGate(readText('src/commands/mad-db.ts').includes('madDbCommand'), 'mad-db command wrapper missing')
assertGate(readText('src/core/commands/mad-db-command.ts').includes('I AUTHORIZE ONE-CYCLE DB BREAK-GLASS'), 'mad-db command must require exact ack phrase')
assertGate(DOLLAR_COMMANDS.some((entry: any) => entry.command === '$MAD-DB'), '$MAD-DB dollar command must be visible in sks dollar-commands')
assertGate(DOLLAR_COMMAND_ALIASES.some((entry: any) => entry.canonical === '$MAD-SKS' && entry.app_skill === '$mad-db'), '$mad-db app skill alias must be visible in sks dollar-commands')
assertGate(routeByDollarCommand('MAD-DB')?.command === '$MAD-SKS', '$MAD-DB must resolve to the MAD-SKS permission route')
assertGate(routeByDollarCommand('mad-db')?.command === '$MAD-SKS', '$mad-db must resolve to the MAD-SKS permission route')
assertGate(readText('src/core/init.ts').includes("'mad-db':") && readText('src/core/init.ts').includes('sks mad-db enable'), 'mad-db generated picker skill template missing')
emitGate('mad-db:command', { command: 'sks mad-db', dollar_command: '$MAD-DB', app_skill_alias: '$mad-db' })
