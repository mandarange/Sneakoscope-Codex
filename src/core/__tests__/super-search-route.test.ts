import test from 'node:test';
import assert from 'node:assert/strict';
import { routePrompt } from '../routes.js';

test('Super-Search is the only source intelligence dollar route', () => {
  assert.equal(routePrompt('$Super-Search run "current package release notes"')?.id, 'SuperSearch');
  assert.notEqual(routePrompt(`$${['Insane', 'Search'].join('-')} run "current package release notes"`)?.id, 'SuperSearch');
  assert.notEqual(routePrompt(`$${['Ultra', 'Search'].join('-')} run "current package release notes"`)?.id, 'SuperSearch');
});
