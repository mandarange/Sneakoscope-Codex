import { sha256 } from '../../fsx.js';
import type { SksMenuBarBuildStamp } from './types.js';

export function aggregateFileHashes(hashes: Record<string, string>): string {
  return sha256(Object.entries(hashes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}:${digest}`)
    .join('\n'));
}

export function createSksMenuBarBuildStamp(input: {
  packageVersion: string;
  sourceHashes: Record<string, string>;
  resourceHashes: Record<string, string>;
  actionScriptSha256: string;
  infoPlistSha256: string;
  launchAgentSha256: string;
  swiftcVersion: string;
  codesignIdentifier: string;
}): SksMenuBarBuildStamp {
  return {
    schema: 'sks.sks-menubar-build-stamp.v2',
    package_version: input.packageVersion,
    source_sha256: aggregateFileHashes(input.sourceHashes),
    source_files_sha256: input.sourceHashes,
    resources_sha256: aggregateFileHashes(input.resourceHashes),
    resource_files_sha256: input.resourceHashes,
    action_script_sha256: input.actionScriptSha256,
    info_plist_sha256: input.infoPlistSha256,
    launch_agent_sha256: input.launchAgentSha256,
    swiftc_version: input.swiftcVersion,
    codesign_identifier: input.codesignIdentifier
  };
}

export function menuBarBuildStampsEqual(
  left: SksMenuBarBuildStamp | null,
  right: SksMenuBarBuildStamp
): boolean {
  return Boolean(left && JSON.stringify(left) === JSON.stringify(right));
}
