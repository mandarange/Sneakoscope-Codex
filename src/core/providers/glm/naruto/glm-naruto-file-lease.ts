export interface FileLease {
  readonly path: string;
  readonly shardIds: readonly string[];
  readonly exclusive: boolean;
}

export function planFileLeases(shardTargetPaths: ReadonlyMap<string, readonly string[]>): readonly FileLease[] {
  const pathToShards = new Map<string, string[]>();
  for (const [shardId, paths] of shardTargetPaths) {
    for (const p of paths) {
      const list = pathToShards.get(p) || [];
      list.push(shardId);
      pathToShards.set(p, list);
    }
  }

  const leases: FileLease[] = [];
  for (const [path, shardIds] of pathToShards) {
    leases.push({
      path,
      shardIds,
      exclusive: shardIds.length === 1
    });
  }
  return leases;
}

export function hasLeaseConflict(leases: readonly FileLease[], shardId: string): boolean {
  return leases.some((lease) => !lease.exclusive && lease.shardIds.includes(shardId));
}
