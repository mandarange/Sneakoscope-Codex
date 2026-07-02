import { formatUserLabel } from './labels.js';

export function profileLabel(user) {
  return formatUserLabel(user.name);
}
