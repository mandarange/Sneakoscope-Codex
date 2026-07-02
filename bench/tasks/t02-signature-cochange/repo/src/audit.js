import { formatUserLabel } from './labels.js';

export function auditLabel(user) {
  return formatUserLabel(user.name);
}
