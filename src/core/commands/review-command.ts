import path from 'node:path';
import { flag } from '../../cli/args.js';
import { printJson } from '../../cli/output.js';
import { projectRoot, readText, runProcess, writeJsonAtomic, nowIso } from '../fsx.js';
import { ui } from '../../cli/cli-theme.js';

type Evidence = 'machine' | 'llm';
type Severity = 'blocker' | 'high' | 'medium' | 'low';

interface ReviewFinding {
  id: string;
  severity: Severity;
  evidence: Evidence;
  source: string;
  file?: string;
  line?: number;
  message: string;
  command?: string;
}

const LENSES = [
  'review-correctness',
  'review-security',
  'review-lean',
  'review-regression'
];

export async function reviewCommand(args: string[] = []) {
  const root = path.resolve(String(readOption(args, '--root', '') || await projectRoot()));
  const diff = await collectDiff(root, args);
  if (!diff.files.length) {
    const report = buildReport({ files: [], machine: { checks: [], findings: [] }, lenses: [], fix: null });
    if (flag(args, '--json')) return printJson(report);
    ui.banner('review');
    ui.ok('변경 없음');
    return report;
  }
  const [machine, lenses] = await Promise.all([
    runMachineChecks(root, diff),
    runReadOnlyReviewLenses(diff)
  ]);
  let fix: any = null;
  if (flag(args, '--fix')) fix = await attemptMachineFix(root, machine.findings);
  const report = buildReport({ files: diff.files, machine, lenses, fix });
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'review-report.json'), report);
  if (flag(args, '--json')) return printJson(report);
  printReviewReport(report);
  if (report.verdict === 'blocked') process.exitCode = 1;
  return report;
}

async function collectDiff(root: string, args: string[]) {
  const staged = flag(args, '--staged');
  const ref = String(readOption(args, '--diff', '') || '');
  const nameArgs = staged ? ['diff', '--staged', '--name-only'] : ref ? ['diff', ref, '--name-only'] : ['diff', '--name-only'];
  const diffArgs = staged ? ['diff', '--staged', '--no-ext-diff'] : ref ? ['diff', ref, '--no-ext-diff'] : ['diff', '--no-ext-diff'];
  const names = await runProcess('git', nameArgs, { cwd: root, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  const body = await runProcess('git', diffArgs, { cwd: root, timeoutMs: 15000, maxOutputBytes: 2 * 1024 * 1024 });
  const files = String(names.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    mode: staged ? 'staged' : ref ? `diff:${ref}` : 'worktree',
    files,
    text: body.stdout || '',
    command: ['git', ...diffArgs].join(' ')
  };
}

async function runMachineChecks(root: string, diff: Awaited<ReturnType<typeof collectDiff>>) {
  const findings: ReviewFinding[] = [];
  const checks: Array<{ command: string; ok: boolean; code?: number | null }> = [];
  findings.push(...await conflictMarkerFindings(root, diff.files));
  findings.push(...secretPatternFindings(diff.text));
  if (diff.files.some((file) => /\.(ts|tsx|mts|cts)$/.test(file))) {
    const command = 'tsc -p tsconfig.json --noEmit';
    const result = await runProcess('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], {
      cwd: root,
      timeoutMs: 120000,
      maxOutputBytes: 512 * 1024
    });
    checks.push({ command, ok: result.code === 0, code: result.code });
    if (result.code !== 0) {
      findings.push({
        id: 'machine:typecheck',
        severity: 'blocker',
        evidence: 'machine',
        source: 'typescript',
        message: summarizeProcessOutput(result.stderr || result.stdout || 'TypeScript check failed.'),
        command
      });
    }
  }
  return { checks, findings, summary: { check_count: checks.length, finding_count: findings.length } };
}

async function conflictMarkerFindings(root: string, files: string[]): Promise<ReviewFinding[]> {
  const findings: ReviewFinding[] = [];
  for (const file of files) {
    const abs = path.join(root, file);
    const text = await readText(abs, '').catch(() => '');
    const lines = String(text || '').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (/^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/.test(lines[index] || '')) {
        findings.push({
          id: `machine:conflict:${file}:${index + 1}`,
          severity: 'blocker',
          evidence: 'machine',
          source: 'conflict-marker-scan',
          file,
          line: index + 1,
          message: 'Git conflict marker remains in a changed file.'
        });
      }
    }
  }
  return findings;
}

function secretPatternFindings(diffText: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const patterns = [
    /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{12,}['"]/i,
    /sk-[A-Za-z0-9_-]{20,}/
  ];
  const lines = diffText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    if (patterns.some((pattern) => pattern.test(line))) {
      findings.push({
        id: `machine:secret:${index + 1}`,
        severity: 'blocker',
        evidence: 'machine',
        source: 'diff-secret-scan',
        line: index + 1,
        message: 'Added diff line looks like a secret or credential.'
      });
    }
  }
  return findings;
}

async function runReadOnlyReviewLenses(diff: Awaited<ReturnType<typeof collectDiff>>) {
  return LENSES.map((role) => ({
    role,
    evidence: 'llm' as const,
    status: 'not_run',
    findings: [] as ReviewFinding[],
    unverified: [`${role} native read-only worker not run in this local review invocation`],
    files: diff.files.length
  }));
}

async function attemptMachineFix(root: string, findings: ReviewFinding[]) {
  const machine = findings.filter((finding) => finding.evidence === 'machine');
  if (!machine.length) return { attempted: false, reason: 'no_machine_findings' };
  const pkg = JSON.parse(await readText(path.join(root, 'package.json'), '{}'));
  if (pkg?.scripts?.lint && String(pkg.scripts.lint).includes('--fix')) {
    const result = await runProcess('npm', ['run', 'lint', '--', '--fix'], { cwd: root, timeoutMs: 120000, maxOutputBytes: 512 * 1024 });
    return { attempted: true, command: 'npm run lint -- --fix', ok: result.code === 0, code: result.code };
  }
  return { attempted: false, reason: 'no_safe_machine_fixer_available', machine_findings: machine.length };
}

function buildReport(input: { files: string[]; machine: any; lenses: any[]; fix: any }) {
  const findings = dedupeFindings([...(input.machine.findings || []), ...input.lenses.flatMap((lens) => lens.findings || [])]);
  const verdict = findings.some((finding) => finding.severity === 'blocker') ? 'blocked' : findings.length ? 'needs_attention' : 'clean';
  return {
    schema: 'sks.review-report.v1',
    generated_at: nowIso(),
    files: input.files.length,
    machine: input.machine.summary || { check_count: 0, finding_count: 0 },
    lenses: input.lenses,
    findings,
    fix: input.fix,
    verdict
  };
}

function dedupeFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>();
  const severityRank: Record<Severity, number> = { blocker: 0, high: 1, medium: 2, low: 3 };
  return findings
    .filter((finding) => {
      const key = `${finding.evidence}:${finding.source}:${finding.file || ''}:${finding.line || ''}:${finding.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.evidence === b.evidence ? severityRank[a.severity] - severityRank[b.severity] : a.evidence === 'machine' ? -1 : 1);
}

function printReviewReport(report: any) {
  ui.banner('review');
  const ok = report.verdict === 'clean';
  if (ok) ui.ok(`clean (${report.files} files)`);
  else ui.warn(`${report.verdict} (${report.findings.length} findings across ${report.files} files)`);
  for (const finding of report.findings.slice(0, 20)) {
    const where = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : finding.command || finding.source;
    ui.kv(`${finding.evidence}/${finding.severity}`, `${where} - ${finding.message}`);
  }
}

function summarizeProcessOutput(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8).join(' | ').slice(0, 900);
}

function readOption(args: string[] = [], name: string, fallback: unknown = null) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}
