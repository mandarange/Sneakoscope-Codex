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

export function detectOwnerScopeCollisions(scopes: Array<{ loop_id: string; owner_scope: SksLoopOwnerScope }>): string[] {
  const blockers: string[] = [];
  for (let i = 0; i < scopes.length; i += 1) {
    for (let j = i + 1; j < scopes.length; j += 1) {
      const a = scopes[i];
      const b = scopes[j];
      if (!a || !b) continue;
      const fileOverlap = intersection(a.owner_scope.files, b.owner_scope.files);
      const scriptOverlap = intersection(a.owner_scope.package_scripts, b.owner_scope.package_scripts);
      if (fileOverlap.length && (a.owner_scope.exclusive || b.owner_scope.exclusive)) blockers.push(`file_collision:${a.loop_id}:${b.loop_id}:${fileOverlap.join(',')}`);
      if (scriptOverlap.length) blockers.push(`script_collision:${a.loop_id}:${b.loop_id}:${scriptOverlap.join(',')}`);
    }
  }
  return blockers;
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

function intersection(a: string[], b: string[]): string[] {
  const rhs = new Set(b);
  return a.filter((value) => rhs.has(value));
}
