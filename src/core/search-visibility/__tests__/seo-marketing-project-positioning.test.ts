import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { runSearchVisibilityApply, runSearchVisibilityPlan, runSearchVisibilityResearch, runSearchVisibilityStrategy } from '../index.js';
import type { SearchVisibilityCliOptions } from '../types.js';

// Words that only describe SKS. A user's strategy, package.json and README must
// never pick them up.
const SKS_POSITIONING = /sneakoscope|codex|proof-first|trust layer|naruto|super-search|release integrity/i;

async function project(t: any, files: Record<string, string>): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-seo-project-positioning-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    await fsp.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fsp.writeFile(path.join(root, file), text);
  }
  return root;
}

const README = [
  '# Bakery Shop',
  '',
  '[![CI](https://example.test/badge.svg)](https://example.test/ci)',
  '',
  'Bakery Shop lets small bakeries take preorders and manage pickup slots.',
  '',
  '## Preorders',
  '',
  'Customers reserve a pickup slot when they place an order.',
  '',
  '## Inventory sync',
  '',
  'Stock counts update as soon as an order is placed.',
  '',
  '## Installation',
  '',
  '```bash',
  'npm install',
  '```',
  '',
].join('\n');

test('marketing strategy describes the project it runs in, from its own sources', async (t) => {
  const root = await project(t, {
    'package.json': JSON.stringify({ name: 'bakery-shop', version: '1.2.0', private: true, keywords: ['bakery'], dependencies: { next: '15.0.0', react: '19.0.0' } }, null, 2),
    'README.md': README,
  });
  const research: any = await runSearchVisibilityResearch('seo', null, options(root));
  assert.equal(research.ok, true, research.blockers.join(', '));
  const strategy: any = await runSearchVisibilityStrategy('seo', research.mission_id, options(root));
  assert.equal(strategy.ok, true, strategy.blockers.join(', '));

  const artifactDir = path.join(root, '.sneakoscope', 'missions', research.mission_id, 'search-visibility');
  const artifact = JSON.parse(await fsp.readFile(path.join(artifactDir, 'marketing-strategy.json'), 'utf8'));
  assert.equal(artifact.positioning.one_liner, 'Bakery Shop lets small bakeries take preorders and manage pickup slots.');
  assert.deepEqual(artifact.message_pillars.map((pillar: any) => pillar.title), ['Preorders', 'Inventory sync']);
  const description = artifact.package_plan.find((plan: any) => plan.operation === 'package-description-update');
  assert.equal(description?.description, artifact.positioning.one_liner);
  const keywords = artifact.package_plan.find((plan: any) => plan.operation === 'package-keywords-update');
  assert.deepEqual(keywords?.keywords, ['bakery', 'bakery-shop', 'nextjs', 'react']);
  assert.doesNotMatch(JSON.stringify({
    positioning: artifact.positioning,
    pillars: artifact.message_pillars,
    keywords: artifact.keyword_clusters,
    package: artifact.package_plan,
    readme: artifact.readme_plan.map((plan: any) => plan.text),
  }), SKS_POSITIONING);

  const plan: any = await runSearchVisibilityPlan('seo', research.mission_id, options(root, { includeMarketing: true }));
  assert.equal(plan.ok, true, plan.blockers.join(', '));
  const apply: any = await runSearchVisibilityApply('seo', research.mission_id, options(root, { includeMarketing: true, apply: true }));
  assert.equal(apply.ok, true, apply.blockers.join(', '));
  const readme = await fsp.readFile(path.join(root, 'README.md'), 'utf8');
  const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.description, artifact.positioning.one_liner);
  assert.match(readme, /- \*\*Preorders:\*\* Customers reserve a pickup slot when they place an order\./);
  assert.doesNotMatch(`${readme}\n${JSON.stringify(pkg)}`, SKS_POSITIONING);
});

test('an existing description is never replaced, and an unmeasured claim is left out', async (t) => {
  const root = await project(t, {
    'package.json': JSON.stringify({ name: '@acme/forms-kit', version: '2.0.0', description: 'The fastest form builder for React.', keywords: ['forms'] }, null, 2),
    'README.md': [
      '# Forms Kit',
      '',
      'Forms Kit turns a JSON schema into an accessible React form.',
      '',
      '## Schema-driven',
      '',
      'Describe the fields once and the form follows the schema.',
      '',
      '## Accessible by default',
      '',
      'Every input gets a label and keyboard focus order.',
      '',
    ].join('\n'),
  });
  const research: any = await runSearchVisibilityResearch('seo', null, options(root));
  assert.equal(research.ok, true, research.blockers.join(', '));
  const strategy: any = await runSearchVisibilityStrategy('seo', research.mission_id, options(root));
  assert.equal(strategy.ok, true, strategy.blockers.join(', '));
  const artifact = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'missions', research.mission_id, 'search-visibility', 'marketing-strategy.json'), 'utf8'));

  // "The fastest" has no measurement behind it, so the README lead positions the project instead.
  assert.equal(artifact.positioning.one_liner, 'Forms Kit turns a JSON schema into an accessible React form.');
  assert.ok(artifact.excluded_claims.some((blocker: string) => blocker.includes('positioning-package-description')), artifact.excluded_claims.join(', '));
  assert.equal(artifact.package_plan.some((plan: any) => plan.operation === 'package-description-update'), false);
  assert.deepEqual(artifact.package_plan.find((plan: any) => plan.operation === 'package-keywords-update')?.keywords, ['forms', 'forms-kit']);
});

test('research and competitor contrast use only URLs the project or the user names', async (t) => {
  const root = await project(t, {
    'package.json': JSON.stringify({ name: 'bakery-shop', private: true, repository: 'github:acme/bakery-shop' }, null, 2),
    'README.md': README,
  });
  const blocked: any = await runSearchVisibilityResearch('seo', null, options(root, { offline: true, includeCompetitors: true }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blockers.includes('marketing_competitor_urls_required'), blocked.blockers.join(', '));
  // A private package has no npm page; the repository shorthand becomes its https URL.
  assert.deepEqual(blocked.project_urls, ['https://github.com/acme/bakery-shop']);
  const ledger = JSON.parse(await fsp.readFile(path.join(root, '.sneakoscope', 'missions', blocked.mission_id, 'search-visibility', 'marketing-source-ledger.json'), 'utf8'));
  assert.doesNotMatch(JSON.stringify(ledger), /mandarange|sneakoscope|oh-my-codex|lazycodex/i);
});

function options(root: string, overrides: Partial<SearchVisibilityCliOptions> = {}): SearchVisibilityCliOptions {
  return {
    root,
    url: null,
    target: 'package',
    framework: 'package',
    offline: true,
    strict: false,
    json: true,
    apply: false,
    yes: false,
    allowDirtyTouched: false,
    browser: false,
    includeLlmsTxt: false,
    includeMarketing: false,
    includeCompetitors: false,
    strategyRef: null,
    maxMarketingSources: 4,
    observeQueries: false,
    queryFile: null,
    scope: [],
    ...overrides,
  };
}
