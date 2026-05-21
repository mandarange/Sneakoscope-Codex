import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ux-review exposes attach-after and recheck command paths', () => {
  sourceIncludes('src/core/commands/image-ux-review-command.ts', [
    'attachAfterImageCommand',
    'action === \'recapture\' || action === \'recheck\'',
    'recaptureRequested'
  ]);
});
