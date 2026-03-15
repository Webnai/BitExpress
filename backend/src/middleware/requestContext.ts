import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

import { logInfo } from "../utils/logging";

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  const startedAt = Date.now();

  logInfo("http.request.start", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
  });

  res.on("finish", () => {
    logInfo("http.request.finish", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      walletAddress: req.auth?.walletAddress,
      uid: req.auth?.uid,
    });
  });

  next();
}
