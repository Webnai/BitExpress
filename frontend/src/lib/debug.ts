type LogFields = Record<string, unknown>;

type SummaryEntry = {
  key: string;
  value: string;
};

const CONSOLE_STYLES = {
  reset: "",
  brand: "color:#22d3ee;font-weight:700",
  infoLevel: "color:#22c55e;font-weight:700",
  errorLevel: "color:#ef4444;font-weight:700",
  event: "color:#f8fafc;font-weight:600",
  key: "color:#94a3b8;font-weight:600",
  value: "color:#e2e8f0",
  details: "color:#a1a1aa",
  methodGet: "color:#60a5fa;font-weight:700",
  methodPost: "color:#a78bfa;font-weight:700",
  methodPut: "color:#f59e0b;font-weight:700",
  methodPatch: "color:#14b8a6;font-weight:700",
  methodDelete: "color:#f43f5e;font-weight:700",
  methodDefault: "color:#cbd5e1;font-weight:700",
  statusSuccess: "color:#22c55e;font-weight:700",
  statusRedirect: "color:#38bdf8;font-weight:700",
  statusClientError: "color:#f59e0b;font-weight:700",
  statusServerError: "color:#ef4444;font-weight:700",
  statusPending: "color:#facc15;font-weight:700",
  statusFailed: "color:#ef4444;font-weight:700",
};

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

function summarizePayload(payload: LogFields): SummaryEntry[] {
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

  const parts: SummaryEntry[] = [];
  for (const key of importantKeys) {
    const formatted = formatValue(payload[key]);
    if (!formatted) continue;
    parts.push({ key, value: formatted });
  }

  return parts;
}

function methodStyle(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return CONSOLE_STYLES.methodGet;
    case "POST":
      return CONSOLE_STYLES.methodPost;
    case "PUT":
      return CONSOLE_STYLES.methodPut;
    case "PATCH":
      return CONSOLE_STYLES.methodPatch;
    case "DELETE":
      return CONSOLE_STYLES.methodDelete;
    default:
      return CONSOLE_STYLES.methodDefault;
  }
}

function statusStyle(status: string): string {
  if (/^\d{3}$/.test(status)) {
    const code = Number(status);
    if (code >= 200 && code < 300) return CONSOLE_STYLES.statusSuccess;
    if (code >= 300 && code < 400) return CONSOLE_STYLES.statusRedirect;
    if (code >= 400 && code < 500) return CONSOLE_STYLES.statusClientError;
    if (code >= 500) return CONSOLE_STYLES.statusServerError;
  }

  const normalized = status.toLowerCase();
  if (["success", "ok", "completed"].some((value) => normalized.includes(value))) {
    return CONSOLE_STYLES.statusSuccess;
  }
  if (["pending", "processing", "queued"].some((value) => normalized.includes(value))) {
    return CONSOLE_STYLES.statusPending;
  }
  if (["failed", "error", "abort", "rejected"].some((value) => normalized.includes(value))) {
    return CONSOLE_STYLES.statusFailed;
  }

  return CONSOLE_STYLES.value;
}

function valueStyleForEntry(entry: SummaryEntry): string {
  if (entry.key === "method") {
    return methodStyle(entry.value);
  }

  if (entry.key === "status") {
    return statusStyle(entry.value);
  }

  return CONSOLE_STYLES.value;
}

function emitLog(level: "info" | "error", event: string, fields: LogFields): void {
  const payload = buildPayload(fields);
  const summary = summarizePayload(payload);
  const levelLabel = level === "error" ? "error" : "info";

  let headline = "%c[BitExpress]%c[%c" + levelLabel + "%c] %c" + event;
  const styleArgs: string[] = [
    CONSOLE_STYLES.brand,
    CONSOLE_STYLES.reset,
    level === "error" ? CONSOLE_STYLES.errorLevel : CONSOLE_STYLES.infoLevel,
    CONSOLE_STYLES.reset,
    CONSOLE_STYLES.event,
  ];

  for (const entry of summary) {
    headline += " | %c" + entry.key + "%c=" + entry.value;
    styleArgs.push(CONSOLE_STYLES.key, valueStyleForEntry(entry));
  }

  if (level === "error") {
    console.error(headline, ...styleArgs);
    console.error("%c[BitExpress][details]", CONSOLE_STYLES.details, payload);
    return;
  }

  console.log(headline, ...styleArgs);
}

export function logClientInfo(event: string, fields: LogFields = {}): void {
  emitLog("info", event, fields);
}

export function logClientError(event: string, fields: LogFields = {}): void {
  emitLog("error", event, fields);
}