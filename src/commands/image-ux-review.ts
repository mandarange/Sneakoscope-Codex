import { imageUxReviewCommand } from '../core/commands/image-ux-review-command.js';

export async function run(command: any, args: any = []) {
  return imageUxReviewCommand(command, args);
}
