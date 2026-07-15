import fs from 'node:fs';

function assertGate(ok: boolean, message: string, detail?: unknown) {
  if (!ok) {
    console.error(JSON.stringify({ schema: 'sks.update-default-command-check.v1', ok: false, message, detail }, null, 2));
    process.exit(1);
  }
}

const registry = fs.readFileSync('src/cli/command-registry.ts', 'utf8');
const basicCli = fs.readFileSync('src/core/commands/basic-cli.ts', 'utf8');
const update = fs.readFileSync('src/core/update-check.ts', 'utf8');
const routes = fs.readFileSync('src/core/routes.ts', 'utf8');

assertGate(
  registry.includes("subcommand(() => import(basicModule), 'updateCommand', 'dist/core/commands/basic-cli.js', 'now')"),
  'bare sks update must default to update now'
);
assertGate(
  basicCli.includes("export async function updateCommand(sub: any = 'now'"),
  'updateCommand default must be now'
);
assertGate(
  basicCli.includes("action.startsWith('-')") && basicCli.includes('effectiveArgs = [String(sub), ...args]'),
  'sks update --json/--dry-run must be treated as update now with flags'
);
assertGate(
  update.includes("[entrypoint, 'menubar', 'install', '--json']")
    && update.includes('entrypoint: newBinary')
    && update.includes('sks_menubar'),
  'update now must refresh the SKS menu bar through the updated package-local entrypoint'
);
assertGate(
  routes.includes('sks update status|check|review|now|rollback'),
  'command catalog must document bare sks update as the default update path'
);

console.log(JSON.stringify({
  schema: 'sks.update-default-command-check.v1',
  ok: true,
  checks: [
    'registry_default_now',
    'basic_cli_default_now',
    'flag_first_default_now',
    'updated_package_local_menubar_stage',
    'command_catalog_usage'
  ]
}, null, 2));
