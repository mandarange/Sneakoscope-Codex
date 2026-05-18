// @ts-nocheck
import { exists } from '../../fsx.js';

export async function watchTmuxScoutOutputs({ jobs = [], timeoutMs = 120000, pollMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(jobs.map((job) => job.scout_id));
  const completed = new Set();
  while (pending.size && Date.now() < deadline) {
    for (const job of jobs) {
      if (!pending.has(job.scout_id)) continue;
      if (await exists(job.output_file)) {
        pending.delete(job.scout_id);
        completed.add(job.scout_id);
      }
    }
    if (pending.size) await sleep(pollMs);
  }
  return {
    jobs: jobs.map((job) => completed.has(job.scout_id)
      ? { ...job, status: 'fulfilled', code: 0 }
      : { ...job, status: 'rejected', code: 124, reason: 'tmux_scout_output_timeout' })
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
