#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const mad = readText('src/core/commands/mad-sks-command.ts')
assertGate(mad.includes('--mad-db') && mad.includes('--ack') && mad.includes('createMadDbCapability'), 'sks --mad must wire --mad-db --ack into capability creation')
assertGate(mad.includes('mad_db_active') && mad.includes('mad_db_cycle_id'), 'MAD launch must mark current state with Mad-DB capability')
emitGate('mad-db:mad-command', { flag: '--mad-db' })
