import { createHash, randomBytes } from "crypto";

import { getAddressFromPublicKey, verifySignature, TransactionVersion } from "@stacks/transactions";

import { db, AuthChallenge } from "../db";
import { getFirebaseAdminAuth } from "../firebaseAdmin";

const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function transactionVersionForWallet(walletAddress: string): TransactionVersion {
  return walletAddress.startsWith("SP")
    ? TransactionVersion.Mainnet
    : TransactionVersion.Testnet;
}

export async function createAuthChallenge(walletAddress: string): Promise<AuthChallenge> {
  const nonce = randomBytes(16).toString("hex");
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + AUTH_CHALLENGE_TTL_MS;
  const createdAt = nowIso();
  const expiresAt = new Date(expiresAtMs).toISOString();

  const challenge: AuthChallenge = {
    walletAddress,
    nonce,
    message: [
      "BitExpress Sign-In",
      `Wallet: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Issued At: ${createdAt}`,
      `Expires At: ${expiresAt}`,
    ].join("\n"),
    createdAt,
    createdAtMs,
    expiresAt,
    expiresAtMs,
  };

  await db.saveAuthChallenge(challenge);
  return challenge;
}

export async function verifyAuthChallengeAndMintToken(input: {
  walletAddress: string;
  nonce: string;
  signature: string;
  publicKey: string;
}): Promise<string> {
  const challenge = await db.getAuthChallenge(input.walletAddress);
  if (!challenge) {
    throw new Error("Auth challenge not found. Request a new challenge.");
  }

  if (challenge.usedAt) {
    throw new Error("Auth challenge has already been used.");
  }

  if (challenge.nonce !== input.nonce) {
    throw new Error("Invalid auth nonce.");
  }

  if (Date.now() > challenge.expiresAtMs) {
    throw new Error("Auth challenge expired.");
  }

  const txVersion = transactionVersionForWallet(input.walletAddress);
  const derivedAddress = getAddressFromPublicKey(input.publicKey, txVersion);

  if (derivedAddress !== input.walletAddress) {
    throw new Error("Public key does not match wallet address.");
  }

  const messageHash = createHash("sha256").update(challenge.message).digest("hex");
  const signatureValid = verifySignature(
    normalizeHex(input.signature),
    messageHash,
    normalizeHex(input.publicKey)
  );

  if (!signatureValid) {
    throw new Error("Invalid wallet signature.");
  }

  await db.markAuthChallengeUsed(input.walletAddress, nowIso(), Date.now());

  return getFirebaseAdminAuth().createCustomToken(input.walletAddress, {
    walletAddress: input.walletAddress,
  });
}
