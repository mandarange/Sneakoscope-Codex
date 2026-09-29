import type { SksLoopOwnerScope } from './loop-schema.js';
import type { LoopDomain } from './loop-decomposer.js';

export function inferLoopOwnerScope(input: {
  domain: LoopDomain;
  integration?: boolean;
}): SksLoopOwnerScope {
  if (input.integration) {
    return {
      files: ['CHANGELOG.md'],
      directories: ['.sneakoscope/missions'],
      package_scripts: [],
      release_gate_ids: ['release:dag-full-coverage'],
      exclusive: true,
      collision_policy: 'integration-only'
    };
  }
  const files = [...new Set(input.domain.files.filter((file) => !['package.json', 'release-gates.v2.json'].includes(file)))];
  const releaseGateIds = input.domain.gates.filter((gate) => !gate.includes('*'));
  const ownsPackage = input.domain.files.includes('package.json');
  return {
    files,
    directories: input.domain.dirs.filter((dir) => dir !== 'package.json' && dir !== 'release-gates.v2.json'),
    package_scripts: ownsPackage ? [] : inferPackageScripts(input.domain.id),
    release_gate_ids: releaseGateIds,
    exclusive: input.domain.id !== 'docs',
    collision_policy: input.domain.id === 'docs' ? 'wait' : 'handoff'
  };
}

export function memoryHintMayExpandOwnerScope(): false {
  return false;
}

function inferPackageScripts(domainId: string): string[] {
  if (domainId === 'docs') return ['docs:loop-runtime'];
  if (domainId === 'naruto') return ['naruto:loop-mesh'];
  if (domainId === 'release') return ['release:dag-full-coverage'];
  if (domainId === 'loop-general-coding') return ['loop:runtime'];
  return [];
}

