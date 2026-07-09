import fs from 'node:fs/promises';
import path from 'node:path';

export interface OpsReport {
  schema: string;
  ok: boolean;
  generated_at: string;
  blockers: string[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function writeOpsReport(root: string, fileName: string, report: OpsReport): Promise<string> {
  if (report.ok === true && report.blockers.length > 0) {
    throw new Error(`invalid ops report: ok true with blockers in ${fileName}`);
  }
  const reportPath = path.join(root, '.sneakoscope', 'reports', fileName);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

export async function readJsonFile(file: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export function rel(root: string, file: string): string {
  return path.relative(root, file) || '.';
}
