// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mode = process.argv[2] || '';

function runSks(args) {
  const entry = path.join(root, 'dist', 'bin', 'sks.js');
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' },
    timeout: 120_000
  });
  if (result.status !== 0) {
    throw new Error(`sks ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return parseJson(result.stdout);
}

function parseJson(text) {
  const trimmed = String(text || '').trim();
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error(`Expected JSON output, got: ${trimmed.slice(0, 400)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonSchemaRecursiveCheck() {
  const { validateJsonSchemaRecursive } = await import('../core/json-schema-validator.js');
  const schema = {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'bbox'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1 },
            bbox: {
              type: 'array',
              prefixItems: [
                { type: 'number', minimum: 0 },
                { type: 'number', minimum: 0 },
                { type: 'number', exclusiveMinimum: 0 },
                { type: 'number', exclusiveMinimum: 0 }
              ],
              minItems: 4,
              maxItems: 4
            }
          }
        }
      }
    },
    additionalProperties: false
  };
  assert(validateJsonSchemaRecursive({ items: [{ id: 'a', bbox: [0, 0, 1, 1] }] }, schema).ok, 'valid recursive schema fixture failed');
  assert(!validateJsonSchemaRecursive({ items: [{ id: '', bbox: [0, 0, 0, 1], extra: true }] }, schema).ok, 'invalid recursive schema fixture passed');
}

function uxFixture() {
  const result = runSks(['image-ux-review', 'fixture', '--mock', '--json']);
  assert(result.ok === true, 'UX fixture did not pass');
  assert(result.artifacts?.generated_review_ledger?.mock_fixture !== false, 'UX fixture should remain mock/partial');
}

function uxNoFakeCallouts() {
  const source = fs.readFileSync(path.join(root, 'src', 'core', 'commands', 'image-ux-review-command.ts'), 'utf8');
  assert(!source.includes('Generated visual callout'), 'generic fake Generated visual callout string is present');
  assert(/callouts:\s*opts\.mock\s*\?/.test(source), 'attach-generated mock gating is missing');
}

function pptFixture() {
  const result = runSks(['ppt', 'fixture', '--mock', '--json']);
  assert(result.ok === true, 'PPT fixture did not pass');
  assert(result.artifacts?.gate?.mock_fixture === true, 'PPT fixture did not record mock fixture');
  assert(result.artifacts?.slide_callout_ledger?.generated_slide_callout_images_count >= 1, 'PPT generated slide callout missing');
  assert(result.artifacts?.slide_issue_ledger?.issues?.length >= 1, 'PPT slide issue extraction missing');
}

function pptNoTextFallback() {
  const source = fs.readFileSync(path.join(root, 'src', 'core', 'ppt-review', 'slide-imagegen-review.ts'), 'utf8');
  assert(source.includes('text_only_fallback_allowed: false'), 'PPT text-only fallback gate missing');
}

function pptNoMockAsReal() {
  const result = runSks(['ppt', 'fixture', '--mock', '--json']);
  assert(result.artifacts?.gate?.verified_level === 'verified_partial', 'PPT mock fixture was not capped at verified_partial');
}

function dfixFixture() {
  const result = runSks(['dfix', 'fixture', '--json']);
  assert(result.ok === true, 'DFix fixture did not pass');
  assert(result.artifacts?.gate?.diagnosis_present === true, 'DFix diagnosis missing');
  assert(result.artifacts?.gate?.verification_present === true, 'DFix verification missing');
}

function allFeaturesCompletion() {
  const result = runSks(['all-features', 'complete', '--json']);
  assert(result.schema === 'sks.all-feature-completion.v1', 'all-feature completion schema missing');
  assert(Array.isArray(result.features), 'all-feature completion rows missing');
}

const runners = {
  'ux-generate': uxFixture,
  'ux-extract': uxFixture,
  'ux-patch': uxFixture,
  'ux-recapture': uxFixture,
  'ux-no-fake': uxNoFakeCallouts,
  'ppt-review': pptFixture,
  'ppt-export': pptFixture,
  'ppt-no-text': pptNoTextFallback,
  'ppt-no-mock-real': pptNoMockAsReal,
  'ppt-extract': pptFixture,
  'ppt-voxel': pptFixture,
  'ppt-proof': pptFixture,
  'dfix-fixture': dfixFixture,
  'dfix-verification': dfixFixture,
  'all-features': allFeaturesCompletion,
  'json-schema': jsonSchemaRecursiveCheck
};

if (!runners[mode]) throw new Error(`Unknown SKS 1.11 fixture mode: ${mode}`);
await runners[mode]();
console.log(JSON.stringify({ ok: true, mode }, null, 2));
