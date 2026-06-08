import { madDbCommand } from '../core/commands/mad-db-command.js'

export async function run(_command: string = 'mad-db', args: string[] = []) {
  return madDbCommand(args)
}
