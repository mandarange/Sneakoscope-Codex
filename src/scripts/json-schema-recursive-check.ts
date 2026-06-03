#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { validateJsonSchema, validateJsonSchemaRecursive } from '../core/json-schema-validator.js';
import { assertGate, emitGate } from './sks-1-11-gate-lib.js';

const schema = {
  type: 'object',
  required: ['name', 'items'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 2 },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['kind', 'score'],
        additionalProperties: false,
        properties: {
          kind: { enum: ['alpha', 'beta'] },
          score: { type: 'integer', minimum: 1 }
        }
      }
    }
  }
};
const pass = validateJsonSchema({ name: 'ok', items: [{ kind: 'alpha', score: 2 }] }, schema);
const fail = validateJsonSchema({ name: 'x', items: [{ kind: 'omega', score: 0, extra: true }] }, schema);
assertGate(pass.ok === true, 'recursive JSON schema validator rejected a valid nested object', pass);
assertGate(fail.ok === false && fail.issues.length >= 3, 'recursive JSON schema validator failed to detect nested issues', fail);

const oneOfPass = validateJsonSchema('a', { oneOf: [{ const: 'a' }, { const: 'b' }] });
const oneOfFail = validateJsonSchema('a', { oneOf: [{ type: 'string' }, { const: 'a' }] });
const anyOfPass = validateJsonSchema(3, { anyOf: [{ type: 'string' }, { type: 'integer' }] });
assertGate(oneOfPass.ok === true && oneOfFail.ok === false && anyOfPass.ok === true, 'oneOf/anyOf behavior regression', { oneOfPass, oneOfFail, anyOfPass });

const localRefSchema = {
  type: 'object',
  required: ['box'],
  properties: {
    box: { '$ref': '#/$defs/box' }
  },
  '$defs': {
    box: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'number' }
    }
  }
};
const localRef = validateJsonSchemaRecursive({ box: [0, 0, 1, 1] }, localRefSchema);
assertGate(localRef.ok === true, '$ref local resolution regression', localRef);

const externalRef = validateJsonSchema({ box: [0, 0, 1, 1] }, { '$ref': 'https://example.invalid/schema.json' });
assertGate(externalRef.ok === false && externalRef.unsupported.some((issue) => issue.code === 'ref_unsupported'), 'external $ref unsupported blocker missing', externalRef);

const targetSchemas = [
  'schemas/codex/image-ux-issue-ledger.schema.json',
  'schemas/codex/image-ux-callout-extraction-report.schema.json',
  'schemas/codex/ppt-slide-issue-ledger.schema.json',
  'schemas/codex/ppt-slide-extraction-report.schema.json',
  'schemas/codex/dfix-diagnosis.schema.json',
  'schemas/codex/dfix-patch-plan.schema.json',
  'schemas/codex/dfix-patch-result.schema.json',
  'schemas/codex/dfix-verification-suggestion.schema.json',
  'schemas/codex/dfix-verification.schema.json',
  'schemas/codex/completion-proof.schema.json',
  'schemas/codex/wrongness-record.schema.json',
  'schemas/codex/agent-result.schema.json',
  'schemas/codex/all-feature-completion.schema.json'
];
const missing = targetSchemas.filter((rel) => !fs.existsSync(path.join(process.cwd(), rel)));
assertGate(missing.length === 0, 'recursive schema target missing', { missing });

emitGate('json-schema:recursive-check', {
  valid_issues: pass.issues.length,
  invalid_issues: fail.issues.length,
  checked_schemas: targetSchemas.length,
  local_ref: localRef.ok
});
