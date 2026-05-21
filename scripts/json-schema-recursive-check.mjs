#!/usr/bin/env node
import { validateJsonSchema } from '../dist/core/json-schema-validator.js';
import { assertGate, emitGate } from './sks-1-11-gate-lib.mjs';

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
emitGate('json-schema:recursive-check', { valid_issues: pass.issues.length, invalid_issues: fail.issues.length });
