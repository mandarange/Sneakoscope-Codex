// Usage is served by the router from the manifest, so `sks mad-sks --help`
// must not pay for loading the MAD-SKS runtime; it is imported on run.
export async function run(_command: any, args: any = []) {
  const { madHighCommand } = await import('../core/commands/mad-sks-command.js');
  const { PACKAGE_VERSION } = await import('../core/version.js');
  return madHighCommand(['--mad-sks', ...args], {
    packageVersion: PACKAGE_VERSION
  });
}
