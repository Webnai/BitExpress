import { NextFunction, Request, Response } from "express";

import { getFirebaseAdminAuth } from "../firebaseAdmin";
import { logRequestError } from "../utils/logging";

function parseBearerToken(req: Request): string | null {
  const header = req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function parseTestToken(token: string): { uid: string; walletAddress: string } | null {
  if (!token.startsWith("test-token:")) return null;

  const parts = token.split(":");
  if (parts.length < 3) return null;

  const uid = parts[1];
  const walletAddress = parts.slice(2).join(":");
  if (!uid || !walletAddress) return null;

  return { uid, walletAddress };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = parseBearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Missing Bearer token." });
    return;
  }

  if (process.env.NODE_ENV === "test") {
    const testAuth = parseTestToken(token);
    if (!testAuth) {
      res.status(401).json({ error: "Invalid test auth token." });
      return;
    }

    req.auth = {
      uid: testAuth.uid,
      walletAddress: testAuth.walletAddress,
      token,
    };
    next();
    return;
  }

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const walletAddress =
      typeof decoded.walletAddress === "string" ? decoded.walletAddress : decoded.uid;

    req.auth = {
      uid: decoded.uid,
      walletAddress,
      token,
    };

    next();
  } catch (error) {
    logRequestError(req, "auth.verify_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    res.status(401).json({ error: "Invalid or expired auth token." });
  }
}
