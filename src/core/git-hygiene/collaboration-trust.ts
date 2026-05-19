import { gitDoctor } from './git-doctor.js';

export async function gitCollaborationTrust(root: string) {
  const doctor = await gitDoctor(root);
  const unpublished = doctor.checks.find((row) => row.id === 'active_local_wrongness_published');
  const stale = doctor.checks.find((row) => row.id === 'generated_indexes_fresh');
  return {
    schema: 'sks.git-collaboration-trust.v1',
    mode: doctor.mode,
    shared_memory_ok: !doctor.blockers.includes('shared_memory_record_schemas') && !doctor.blockers.includes('secret_bearing_shared_files'),
    runtime_noise_ok: doctor.checks.find((row) => row.id === 'runtime_dirs_ignored')?.ok === true,
    unpublished_wrongness: unpublished?.ok ? 0 : countList(unpublished?.detail),
    stale_indexes: stale?.ok ? 0 : countList(stale?.detail),
    status: doctor.ok ? 'verified_partial' : 'blocked',
    issues: [...doctor.blockers, ...doctor.warnings]
  };
}

function countList(value: unknown): number {
  const text = String(value || '');
  if (!text || text.includes('no ')) return 0;
  return text.split(',').filter((item) => item.trim()).length;
}
