#!/usr/bin/env node
import { DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS, routeByDollarCommand } from '../core/routes.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

assertGate(readText('src/cli/command-registry.ts').includes("'mad-db'"), 'mad-db command must be registered')
assertGate(readText('src/commands/mad-db.ts').includes('madDbCommand'), 'mad-db command wrapper missing')
assertGate(readText('src/core/commands/mad-db-command.ts').includes('deprecated_enable_no_capability'), 'legacy mad-db enable must be deprecated and must not create capabilities')
assertGate(DOLLAR_COMMANDS.some((entry: any) => entry.command === '$MAD-DB'), '$MAD-DB dollar command must be visible in sks dollar-commands')
assertGate(DOLLAR_COMMAND_ALIASES.some((entry: any) => entry.canonical === '$MAD-DB' && entry.app_skill === '$mad-db'), '$mad-db app skill alias must point at first-class $MAD-DB')
assertGate(routeByDollarCommand('MAD-DB')?.command === '$MAD-DB', '$MAD-DB must resolve to the first-class MadDB route')
assertGate(routeByDollarCommand('mad-db')?.command === '$MAD-DB', '$mad-db must resolve to the first-class MadDB route')
const initText = readText('src/core/init.ts')
assertGate(initText.includes("'mad-db':") && initText.includes('madDbSkillText()') && initText.includes('dbSafetyGuardSkillText()'), 'mad-db generated picker skill template must come from typed SSOT')
assertGate(readText('src/core/commands/mad-db-command.ts').includes('run|exec|apply-migration'), 'mad-db command must expose execution subcommands')
emitGate('mad-db:command', { command: 'sks mad-db', dollar_command: '$MAD-DB', app_skill_alias: '$mad-db' })
