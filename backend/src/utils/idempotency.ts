import { createHash } from "crypto";
import { Request } from "express";

import { db, IdempotencyRecord } from "../db";

export interface IdempotencyHit {
  responseStatus: number;
  responseBody: unknown;
}

export function getIdempotencyKey(req: Request): string | null {
  const value = req.header("Idempotency-Key");
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hashRequestBody(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function getIdempotentResponse(
  scope: IdempotencyRecord["scope"],
  key: string,
  requestHash: string
): Promise<IdempotencyHit | "mismatch" | null> {
  const existing = await db.getIdempotencyRecord(scope, key);
  if (!existing) return null;
  if (existing.requestHash !== requestHash) return "mismatch";

  return {
    responseStatus: existing.responseStatus,
    responseBody: existing.responseBody,
  };
}

export async function saveIdempotentResponse(record: IdempotencyRecord): Promise<void> {
  await db.saveIdempotencyRecord(record);
}
