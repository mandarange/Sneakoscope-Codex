import test from 'node:test';
import { packageScriptIncludes, sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('flagship evidence coverage is release-gated', () => {
  packageScriptIncludes('evidence:flagship-coverage', 'evidence-flagship-coverage-check.js');
  sourceIncludes('dist/scripts/evidence-flagship-coverage-check.js', ['UX-Review', 'PPT Imagegen Review', 'DFix', 'All-feature completion']);
});
