type LogFields = Record<string, unknown>;

function buildPayload(fields: LogFields): LogFields {
  return {
    timestamp: new Date().toISOString(),
    ...fields,
  };
}

export function logClientInfo(event: string, fields: LogFields = {}): void {
  console.log(`[BitExpress] ${event}`, buildPayload(fields));
}

export function logClientError(event: string, fields: LogFields = {}): void {
  console.error(`[BitExpress] ${event}`, buildPayload(fields));
}