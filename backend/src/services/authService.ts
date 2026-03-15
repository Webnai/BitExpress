import { randomBytes } from "crypto";

import { verifyMessageSignatureRsv } from "@stacks/encryption";
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
    message: `BitExpress Sign-In | wallet=${walletAddress} | nonce=${nonce} | issuedAt=${createdAt} | expiresAt=${expiresAt}`,
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

  const normalizedSignature = normalizeHex(input.signature);
  const normalizedPublicKey = normalizeHex(input.publicKey);

  // Primary path: verify using Stacks message semantics used by stx_signMessage.
  const signatureValid = verifyMessageSignatureRsv({
    signature: normalizedSignature,
    message: challenge.message,
    publicKey: normalizedPublicKey,
  });

  // Backward-compatible fallback for previously signed clients.
  const signatureValidLegacy = !signatureValid
    ? verifySignature(normalizedSignature, challenge.message, normalizedPublicKey)
    : true;

  if (!signatureValidLegacy) {
    throw new Error("Invalid wallet signature.");
  }

  await db.markAuthChallengeUsed(input.walletAddress, nowIso(), Date.now());

  return getFirebaseAdminAuth().createCustomToken(input.walletAddress, {
    walletAddress: input.walletAddress,
  });
}
