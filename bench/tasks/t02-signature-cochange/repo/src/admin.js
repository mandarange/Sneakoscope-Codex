import { formatUserLabel } from './labels.js';

export function adminLabel(user) {
  return formatUserLabel(user.name);
}
