/** Wire constants shared by the broker and its clients (kept free of process/child imports). */
export const LOCAL_DECISION_REQUEST_SCHEMA = 'sks.local-decision-request.v1'
export const LOCAL_DECISION_RESPONSE_SCHEMA = 'sks.local-decision-response.v1'
export const LOCAL_DECISION_SERVICE_METADATA_SCHEMA = 'sks.local-decision-service.v1'
export const LOCAL_DECISION_READINESS_SCHEMA = 'sks.local-decision-runtime-readiness.v1'
export type DecisionRequestMode = 'advisory' | 'shadow' | 'explicit'
