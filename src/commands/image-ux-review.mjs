import { imageUxReviewCommand } from '../core/commands/image-ux-review-command.mjs';

export async function run(command, args = []) {
  return imageUxReviewCommand(command, args);
}
