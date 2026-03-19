import { Router, Request, Response } from "express";

import {
  createAuthChallenge,
  verifyAuthChallengeAndMintToken,
  verifyTurnkeyAuthChallengeAndMintToken,
  type TurnkeyRawSignature,
} from "../services/authService";
import { db } from "../db";
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

    const normalizedWalletAddress = walletAddress.trim();

    const customToken = await verifyAuthChallengeAndMintToken({
      walletAddress: normalizedWalletAddress,
      nonce: nonce.trim(),
      signature: signature.trim(),
      publicKey: publicKey.trim(),
    });

    // Ensure a user profile exists right after successful auth.
    const existingUser = await db.getUserByWallet(normalizedWalletAddress);
    if (!existingUser) {
      await db.upsertUser({
        walletAddress: normalizedWalletAddress,
        country: "unknown",
        actorUid: normalizedWalletAddress,
      });
    }

    logRequestInfo(req, "auth.verify.succeeded", { walletAddress: normalizedWalletAddress });

    res.json({
      customToken,
      walletAddress: normalizedWalletAddress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth verification failed.";
    logRequestError(req, "auth.verify.failed", { message });
    res.status(401).json({ error: message });
  }
});

router.post("/turnkey/verify", async (req: Request, res: Response) => {
  try {
    const { walletAddress, nonce, publicKey, signature } = req.body as {
      walletAddress?: string;
      nonce?: string;
      publicKey?: string;
      signature?: TurnkeyRawSignature;
    };

    if (!walletAddress || !nonce || !publicKey || !signature?.r || !signature?.s) {
      res.status(400).json({
        error: "walletAddress, nonce, publicKey, and signature.{r,s} are required.",
      });
      return;
    }

    const normalizedWalletAddress = walletAddress.trim();

    const customToken = await verifyTurnkeyAuthChallengeAndMintToken({
      walletAddress: normalizedWalletAddress,
      nonce: nonce.trim(),
      publicKey: publicKey.trim(),
      signature: {
        r: signature.r.trim(),
        s: signature.s.trim(),
        v: signature.v?.trim(),
      },
    });

    const existingUser = await db.getUserByWallet(normalizedWalletAddress);
    if (!existingUser) {
      await db.upsertUser({
        walletAddress: normalizedWalletAddress,
        country: "unknown",
        actorUid: normalizedWalletAddress,
      });
    }

    logRequestInfo(req, "auth.turnkey_verify.succeeded", {
      walletAddress: normalizedWalletAddress,
    });

    res.json({
      customToken,
      walletAddress: normalizedWalletAddress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Turnkey auth verification failed.";
    logRequestError(req, "auth.turnkey_verify.failed", { message });
    res.status(401).json({ error: message });
  }
});

export default router;
