#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { writeSecretMigrationJournal } from '../core/config/config-migration-journal.js';

const root = await makeTempRoot('sks-secret-journal-');
const result = await writeSecretMigrationJournal(root, 'fixture-operation', ['.env.local']);
assertGate(result.entry.operation === 'fixture-operation' && result.journal_path.includes('secret-migration-journal.json'), 'secret migration journal must record operation and path', result);
emitGate('update:secret-migration-journal');
