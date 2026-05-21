#!/usr/bin/env node
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.mjs';

requireContains('dfix:verification-recommendation', 'src/core/dfix.ts', [
  'DFIX_VERIFICATION_SUGGESTION_ARTIFACT',
  'writeDfixVerificationSuggestion',
  'suggested_verification_commands',
  'auto_run_requires_opt_in',
  'recovery_action'
]);
requireContains('dfix:verification-recommendation', 'src/core/commands/dfix-command.ts', [
  '--verify-auto'
]);

emitGate('dfix:verification-recommendation', { artifact: 'dfix-verification-suggestion.json' });
