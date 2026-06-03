#!/usr/bin/env node
// @ts-nocheck
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.js';

requireContains('ux-review:run-wires-imagegen', 'src/core/commands/image-ux-review-command.ts', [
  'const shouldGenerateCallouts = flag(args, \'--generate-callouts\') || flag(args, \'--fix\')',
  'generateGptImage2CalloutReview',
  'extractRealCallouts',
  'buildImageUxCalloutExtractionReport'
]);

emitGate('ux-review:run-wires-imagegen', { command_path: 'sks ux-review run', imagegen_adapter: 'generateGptImage2CalloutReview' });
