#!/usr/bin/env node
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.mjs';

requireContains('ppt:reexport-rereview', 'src/core/commands/ppt-command.ts', [
  'attach-fixed-deck',
  'fixedDeckPath',
  'recheck'
]);
requireContains('ppt:reexport-rereview', 'src/core/ppt-review/index.ts', [
  'changed_slides_rechecked',
  'ppt_slide_recheck_missing',
  'fixedDeckPath'
]);
requireContains('ppt:reexport-rereview', 'src/core/ppt-review/ppt-patch-handoff.ts', [
  'deck_binary_edit_unavailable_manual_handoff_required',
  're_export_required'
]);

emitGate('ppt:reexport-rereview', { recheck: 'fixed-deck-or-slide-evidence-required' });
