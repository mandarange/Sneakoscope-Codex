#!/usr/bin/env node
import { DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS, routeByDollarCommand } from '../core/routes.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

assertGate(readText('src/cli/command-registry.ts').includes("'mad-db'"), 'mad-db command must be registered')
assertGate(readText('src/commands/mad-db.ts').includes('madDbCommand'), 'mad-db command wrapper missing')
const madDbCommandSource = readText('src/core/commands/mad-db-command.ts')
assertGate(madDbCommandSource.includes('mad-db is deprecated') && madDbCommandSource.includes('deprecated_alias'), 'mad-db command must warn and annotate deprecated_alias')
assertGate(!DOLLAR_COMMANDS.some((entry: any) => entry.command === '$MAD-DB'), '$MAD-DB deprecated alias must be hidden from new dollar-command listings')
assertGate(DOLLAR_COMMAND_ALIASES.some((entry: any) => entry.canonical === '$MAD-DB' && entry.app_skill === '$mad-db'), '$mad-db app skill alias must remain for deprecated $MAD-DB')
assertGate(routeByDollarCommand('MAD-DB')?.command === '$MAD-DB' && routeByDollarCommand('MAD-DB')?.deprecated === true, '$MAD-DB must resolve to the deprecated alias route')
assertGate(routeByDollarCommand('mad-db')?.command === '$MAD-DB' && routeByDollarCommand('mad-db')?.aliasTo === '$MAD-SKS', '$mad-db must resolve to deprecated alias redirecting to $MAD-SKS')
const initText = readText('src/core/init.ts')
const skillInitText = readText('src/core/init/skills.ts')
const typedSkillSource = `${initText}\n${skillInitText}`
assertGate(typedSkillSource.includes("'mad-db':") && typedSkillSource.includes('merged into mad-sks') && typedSkillSource.includes('madDbSkillText()') && typedSkillSource.includes('dbSafetyGuardSkillText()'), 'mad-db generated skill must be deprecated and SQL-plane policy must be merged into mad-sks')
assertGate(madDbCommandSource.includes('run') && madDbCommandSource.includes('exec') && madDbCommandSource.includes('apply-migration') && madDbCommandSource.includes('sql'), 'mad-db command must translate legacy execution subcommands')
emitGate('mad-db:command', { command: 'sks mad-db', dollar_command: '$MAD-DB', app_skill_alias: '$mad-db', alias_to: '$MAD-SKS' })
