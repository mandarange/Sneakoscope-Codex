// @ts-nocheck
import { imageUxReviewCommand } from '../core/commands/image-ux-review-command.js';

export async function run(command, args = []) {
  return imageUxReviewCommand(command, args);
}
