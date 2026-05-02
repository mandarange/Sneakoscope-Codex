import path from 'node:path';
import { nowIso, writeJsonAtomic } from './fsx.mjs';
import { ARTIFACT_FILES, validateDogfoodReport } from './artifact-schemas.mjs';

export function createDogfoodReport(opts = {}) {
  const findings = opts.findings || [];
  const unresolvedFixable = findings.filter((finding) => finding.classification === 'fixable' && finding.post_fix_verification !== 'passed').length;
  const report = {
    schema_version: 1,
    generated_at: nowIso(),
    passed: Boolean(opts.passed ?? (unresolvedFixable === 0 && opts.post_fix_verification_complete === true)),
    scenario: opts.scenario || 'unassigned',
    computer_use_available: opts.computer_use_available === true,
    browser_available: opts.browser_available === true,
    cycles: Number(opts.cycles || 0),
    findings,
    unresolved_fixable_findings: Number(opts.unresolved_fixable_findings ?? unresolvedFixable),
    post_fix_verification_complete: opts.post_fix_verification_complete === true
  };
  return report;
}

export async function writeDogfoodReport(dir, opts = {}) {
  const report = createDogfoodReport(opts);
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.dogfood_report), report);
  return validateDogfoodReport(report);
}

export function classifyDogfoodFinding(finding = {}) {
  const classification = finding.classification || (finding.fixable === false ? 'blocked' : 'fixable');
  return {
    id: finding.id || 'DF-001',
    severity: finding.severity || 'medium',
    classification,
    description: finding.description || '',
    evidence: finding.evidence || [],
    fix_evidence: finding.fix_evidence || [],
    post_fix_verification: finding.post_fix_verification || (classification === 'fixable' ? 'not_run' : 'not_applicable')
  };
}
