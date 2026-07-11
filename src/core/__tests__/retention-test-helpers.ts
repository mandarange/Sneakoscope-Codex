import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const quietPolicy = {
  max_tmp_age_hours: 999999,
  max_session_state_age_days: 999999,
  max_session_state_files: 1000,
  prune_old_missions: false,
  prune_disposable_report_logs: false
};

export async function makeRoot(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function backdate(file: string) {
  const old = new Date('2020-01-01T00:00:00.000Z');
  await fs.utimes(file, old, old);
}
