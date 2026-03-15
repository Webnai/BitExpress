type LogLevel = "info" | "error";

interface LogFields {
  [key: string]: unknown;
}

function writeLog(level: LogLevel, event: string, fields: LogFields): void {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog("info", event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  writeLog("error", event, fields);
}

export function logRequestInfo(req: Express.Request, event: string, fields: LogFields = {}): void {
  logInfo(event, {
    requestId: req.requestId,
    walletAddress: req.auth?.walletAddress,
    uid: req.auth?.uid,
    ...fields,
  });
}

export function logRequestError(req: Express.Request, event: string, fields: LogFields = {}): void {
  logError(event, {
    requestId: req.requestId,
    walletAddress: req.auth?.walletAddress,
    uid: req.auth?.uid,
    ...fields,
  });
}
