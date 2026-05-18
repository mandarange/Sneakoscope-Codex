import {
  TRUST_KERNEL_SCHEMA,
  TRUST_REPORT_SCHEMA,
  TRUST_STATUSES,
  isTrustStatus,
  trustKernelMetadata,
  type TrustStatus
} from '../../src/core/trust-kernel/trust-kernel-schema.js';

const status: TrustStatus = 'verified_partial';
const statuses: readonly TrustStatus[] = TRUST_STATUSES;
const metadata = trustKernelMetadata();
const kernelSchema: typeof TRUST_KERNEL_SCHEMA = metadata.trust_kernel_schema;
const reportSchema: typeof TRUST_REPORT_SCHEMA = TRUST_REPORT_SCHEMA;
const guardResult: boolean = isTrustStatus(status);

void statuses;
void kernelSchema;
void reportSchema;
void guardResult;
