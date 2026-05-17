import { findProjectRoot, globalSksRoot, sksRoot } from '../core/fsx.mjs';
import { flag } from '../cli/args.mjs';
import { printJson, sksTextLogo } from '../cli/output.mjs';

export async function run(_command, args = []) {
  const project = await findProjectRoot();
  const global = globalSksRoot();
  const active = await sksRoot();
  const result = {
    cwd: process.cwd(),
    mode: project ? 'project' : 'global',
    active_root: active,
    project_root: project,
    global_root: global,
    using_global_root: !project
  };
  if (flag(args, '--json')) return printJson(result);
  console.log(`${sksTextLogo()}\n\nRoot\n`);
  console.log(`Mode:        ${result.mode}`);
  console.log(`Active root: ${active}`);
  console.log(`Project:     ${project || 'none'}`);
  console.log(`Global root: ${global}`);
  if (!project) console.log('\nNo project marker was found here, so SKS will use the per-user global runtime root. Run `sks bootstrap` to initialize the current directory as a project.');
}
