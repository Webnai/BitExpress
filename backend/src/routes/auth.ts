import { Router, Request, Response } from "express";

import { createAuthChallenge, verifyAuthChallengeAndMintToken } from "../services/authService";
import { logRequestError, logRequestInfo } from "../utils/logging";

const router = Router();

router.post("/challenge", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body as { walletAddress?: string };

    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ error: "walletAddress is required." });
      return;
    }

    const challenge = await createAuthChallenge(walletAddress.trim());

    logRequestInfo(req, "auth.challenge.created", {
      walletAddress: challenge.walletAddress,
      expiresAt: challenge.expiresAt,
    });

    res.json({
      walletAddress: challenge.walletAddress,
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    logRequestError(req, "auth.challenge.failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    res.status(500).json({ error: "Failed to create auth challenge." });
  }
});

router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { walletAddress, nonce, signature, publicKey } = req.body as {
      walletAddress?: string;
      nonce?: string;
      signature?: string;
      publicKey?: string;
    };

    if (!walletAddress || !nonce || !signature || !publicKey) {
      res.status(400).json({
        error: "walletAddress, nonce, signature, and publicKey are required.",
      });
      return;
    }

    const customToken = await verifyAuthChallengeAndMintToken({
      walletAddress: walletAddress.trim(),
      nonce: nonce.trim(),
      signature: signature.trim(),
      publicKey: publicKey.trim(),
    });

    logRequestInfo(req, "auth.verify.succeeded", { walletAddress });

    res.json({
      customToken,
      walletAddress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth verification failed.";
    logRequestError(req, "auth.verify.failed", { message });
    res.status(401).json({ error: message });
  }
});

export default router;
