import { createHash, randomBytes } from "crypto";

import { verifyMessageSignatureRsv } from "@stacks/encryption";
import { getAddressFromPublicKey, verifySignature, TransactionVersion } from "@stacks/transactions";
import { payments, networks } from "bitcoinjs-lib";
import { secp256k1 } from "@noble/curves/secp256k1";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

import { db, AuthChallenge } from "../db";
import { getFirebaseAdminAuth } from "../firebaseAdmin";

const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface TurnkeyRawSignature {
  r: string;
  s: string;
  v?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function normalizeHexComponent(value: string, expectedLength: number): string {
  const normalized = normalizeHex(value).toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length > expectedLength) {
    throw new Error("Invalid Turnkey signature component.");
  }

  return normalized.padStart(expectedLength, "0");
}

function toBytes(hex: string): Uint8Array {
  const normalized = normalizeHex(hex);
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex input.");
  }

  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

function isBitcoinAddress(value: string): boolean {
  return /^(bc1|tb1|1|3|m|n|2)[a-zA-Z0-9]+$/.test(value);
}

function isLikelySolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function networkForBitcoinAddress(address: string) {
  return address.startsWith("bc1") || address.startsWith("1") || address.startsWith("3")
    ? networks.bitcoin
    : networks.testnet;
}

function deriveBitcoinAddressCandidates(publicKeyHex: string, network: typeof networks.bitcoin): string[] {
  const publicKey = Buffer.from(normalizeHex(publicKeyHex), "hex");

  const p2wpkh = payments.p2wpkh({ pubkey: publicKey, network }).address;
  const p2pkh = payments.p2pkh({ pubkey: publicKey, network }).address;
  const p2sh = payments.p2sh({
    redeem: payments.p2wpkh({ pubkey: publicKey, network }),
    network,
  }).address;

  return [p2wpkh, p2pkh, p2sh].filter((value): value is string => Boolean(value));
}

function verifyTurnkeySignature(message: string, publicKeyHex: string, signature: TurnkeyRawSignature): boolean {
  const digest = createHash("sha256").update(message, "utf8").digest();
  const r = normalizeHexComponent(signature.r, 64);
  const s = normalizeHexComponent(signature.s, 64);
  const compactSignature = toBytes(`${r}${s}`);
  const publicKey = toBytes(publicKeyHex);

  return secp256k1.verify(compactSignature, digest, publicKey);
}

function verifyTurnkeyEd25519Signature(message: string, publicKeyHex: string, signature: TurnkeyRawSignature): boolean {
  const r = normalizeHexComponent(signature.r, 64);
  const s = normalizeHexComponent(signature.s, 64);
  const compactSignature = toBytes(`${r}${s}`);
  const publicKey = toBytes(publicKeyHex);
  const messageBytes = new TextEncoder().encode(message);

  return ed25519.verify(compactSignature, messageBytes, publicKey);
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

export async function verifyTurnkeyAuthChallengeAndMintToken(input: {
  walletAddress: string;
  nonce: string;
  publicKey: string;
  signature: TurnkeyRawSignature;
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

  if (!isBitcoinAddress(input.walletAddress)) {
    if (!isLikelySolanaAddress(input.walletAddress)) {
      throw new Error("Unsupported Turnkey wallet address format for auth bridge.");
    }

    const normalizedPublicKey = normalizeHex(input.publicKey);
    const derivedSolanaAddress = bs58.encode(Buffer.from(normalizedPublicKey, "hex"));
    if (derivedSolanaAddress !== input.walletAddress) {
      throw new Error("Public key does not match wallet address.");
    }

    const signatureValid = verifyTurnkeyEd25519Signature(
      challenge.message,
      input.publicKey,
      input.signature,
    );

    if (!signatureValid) {
      throw new Error("Invalid Turnkey wallet signature.");
    }

    await db.markAuthChallengeUsed(input.walletAddress, nowIso(), Date.now());

    return getFirebaseAdminAuth().createCustomToken(input.walletAddress, {
      walletAddress: input.walletAddress,
      authProvider: "turnkey",
    });
  }

  const network = networkForBitcoinAddress(input.walletAddress);
  const candidates = deriveBitcoinAddressCandidates(input.publicKey, network);
  if (!candidates.includes(input.walletAddress)) {
    throw new Error("Public key does not match wallet address.");
  }

  const signatureValid = verifyTurnkeySignature(challenge.message, input.publicKey, input.signature);
  if (!signatureValid) {
    throw new Error("Invalid Turnkey wallet signature.");
  }

  await db.markAuthChallengeUsed(input.walletAddress, nowIso(), Date.now());

  return getFirebaseAdminAuth().createCustomToken(input.walletAddress, {
    walletAddress: input.walletAddress,
    authProvider: "turnkey",
  });
}
