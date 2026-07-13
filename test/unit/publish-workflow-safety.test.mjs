import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('npm publish workflow is manual-only and requires a full release proof', () => {
  const workflow = fs.readFileSync('.github/workflows/publish-npm.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /inputs\.confirm_publish == true/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /node-version: '24\.x'/);
  assert.match(workflow, /npm install --global npm@11\.5\.1/);
  assert.match(workflow, /SKS_PUBLISH_AUTH_MODE: trusted-publisher/);
  assert.doesNotMatch(workflow, /npm whoami/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|_authToken/);
  assert.doesNotMatch(workflow, /if \[ "\$\{\{ inputs\.version \}\}"/);
  assert.match(workflow, /REQUESTED_VERSION: \$\{\{ inputs\.version \}\}/);
  assert.match(workflow, /PACKAGE_NAME: \$\{\{ steps\.package\.outputs\.name \}\}/);
  assert.match(workflow, /npm run release:check:full/);
  assert.match(workflow, /release-check-stamp\.js verify/);
  assert.ok(workflow.indexOf('npm run release:check:full') < workflow.indexOf('npm publish --ignore-scripts'));
});
