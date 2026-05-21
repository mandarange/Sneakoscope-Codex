import test from 'node:test';
import { packageScriptIncludes, sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('flagship evidence coverage is release-gated', () => {
  packageScriptIncludes('evidence:flagship-coverage', 'evidence-flagship-coverage-check.mjs');
  sourceIncludes('scripts/evidence-flagship-coverage-check.mjs', ['UX-Review', 'PPT Imagegen Review', 'DFix', 'All-feature completion']);
});
