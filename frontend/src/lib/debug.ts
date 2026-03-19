type LogFields = Record<string, unknown>;

function buildPayload(fields: LogFields): LogFields {
  return {
    timestamp: new Date().toISOString(),
    ...fields,
  };
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function summarizePayload(payload: LogFields): string {
  const importantKeys = [
    "txid",
    "status",
    "message",
    "transferId",
    "pendingStacksTxId",
    "path",
    "method",
    "requestId",
  ];

  const parts: string[] = [];
  for (const key of importantKeys) {
    const formatted = formatValue(payload[key]);
    if (!formatted) continue;
    parts.push(`${key}=${formatted}`);
  }

  return parts.join(" | ");
}

function emitLog(level: "info" | "error", event: string, fields: LogFields): void {
  const payload = buildPayload(fields);
  const summary = summarizePayload(payload);
  const prefix = level === "error" ? "[BitExpress][error]" : "[BitExpress][info]";
  const headline = `${prefix} ${event}${summary ? ` | ${summary}` : ""}`;

  if (level === "error") {
    console.error(headline);
    console.error("[BitExpress][details]", payload);
    return;
  }

  console.log(headline);
}

export function logClientInfo(event: string, fields: LogFields = {}): void {
  emitLog("info", event, fields);
}

export function logClientError(event: string, fields: LogFields = {}): void {
  emitLog("error", event, fields);
}