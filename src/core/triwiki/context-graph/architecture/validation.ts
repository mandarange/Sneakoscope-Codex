/**
 * Fail-closed validation for Architecture Map mission artifacts.
 */
import {
  ARCHITECTURE_BASELINE_SCHEMA,
  ARCHITECTURE_REVIEW_SCHEMA,
  type ArchitectureBaselineV1
} from './contracts.js';
import { verifyArchitectureBaselineSeal } from './baseline.js';

export interface ArchitectureValidationResult {
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function validateArchitectureBaseline(value: unknown): ArchitectureValidationResult {
  const blockers: string[] = [];
  const record = asRecord(value);
  if (!record) return { ok: false, blockers: ['not_an_object'] };
  if (record.schema !== ARCHITECTURE_BASELINE_SCHEMA) blockers.push('schema');
  if (record.required !== true) blockers.push('required');
  if (record.capturedBeforeMutation !== true) blockers.push('capturedBeforeMutation');
  for (const key of [
    'missionId',
    'worktreeFingerprintHash',
    'graphHash',
    'policyHash',
    'analyzerVersion',
    'serializerVersion',
    'canonicalPayloadHash',
    'seal'
  ]) {
    if (typeof record[key] !== 'string' || !(record[key] as string).length) blockers.push(key);
  }
  if (!Array.isArray(record.findings)) blockers.push('findings');
  if (!record.metrics || typeof record.metrics !== 'object') blockers.push('metrics');
  if (blockers.length === 0) {
    const baseline = value as ArchitectureBaselineV1;
    if (!verifyArchitectureBaselineSeal(baseline)) blockers.push('seal_mismatch');
  }
  return { ok: blockers.length === 0, blockers: Object.freeze(blockers) };
}

export function validateArchitectureReview(value: unknown): ArchitectureValidationResult {
  const blockers: string[] = [];
  const record = asRecord(value);
  if (!record) return { ok: false, blockers: ['not_an_object'] };
  if (record.schema !== ARCHITECTURE_REVIEW_SCHEMA) blockers.push('schema');
  for (const key of [
    'missionId',
    'baselineSeal',
    'baselineHash',
    'afterInputHash',
    'canonicalPayloadHash'
  ]) {
    if (typeof record[key] !== 'string' || !(record[key] as string).length) blockers.push(key);
  }
  if (record.verdict !== 'pass' && record.verdict !== 'block') blockers.push('verdict');
  for (const key of [
    'changedPaths',
    'accountedChangedPaths',
    'unaccountedChangedPaths',
    'newFindings',
    'blockingFindingIds'
  ]) {
    if (!Array.isArray(record[key])) blockers.push(key);
  }
  return { ok: blockers.length === 0, blockers: Object.freeze(blockers) };
}

