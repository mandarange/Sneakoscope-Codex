import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramPairingReadiness } from '../../commands/telegram-command.js';

test('status reports a persisted group pairing as invalid and not ready', () => {
  const readiness = telegramPairingReadiness({
    schema: 'sks.telegram-config.v1',
    bot_token_ref: { type: 'external_file', path: '/tmp/telegram-token' },
    paired_chat_ids: ['-1001234567890'],
    paired_user_ids: ['456']
  });

  assert.deepEqual(readiness, {
    pairing_valid: false,
    pairing_issues: ['paired_chat_ids'],
    blocker: 'telegram_pairing_invalid:paired_chat_ids'
  });
});

test('status keeps a positive private pairing ready', () => {
  const readiness = telegramPairingReadiness({
    schema: 'sks.telegram-config.v1',
    bot_token_ref: { type: 'external_file', path: '/tmp/telegram-token' },
    paired_chat_ids: ['123'],
    paired_user_ids: ['456']
  });

  assert.deepEqual(readiness, {
    pairing_valid: true,
    pairing_issues: [],
    blocker: null
  });
});
