import { randomUUID } from "crypto";
import { FieldValue, Firestore, getFirestore } from "firebase-admin/firestore";

import {
  assertFirebaseAdminConfiguredInProduction,
  initializeFirebaseAdminIfNeeded,
  isFirebaseAdminConfigured,
} from "./firebaseAdmin";

export interface AuditFields {
  createdByUid: string;
  updatedByUid: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface Transfer extends AuditFields {
  id: string;
  sender: string;
  receiver: string;
  onChainTransferId?: number;
  amount: number; // in USDCx base units (6 decimals)
  amountUsd: number;
  fee: number;
  netAmount: number;
  currency: string;
  sourceCountry: string;
  destCountry: string;
  recipientPhone?: string;
  recipientName?: string;
  recipientMobileProvider?: string;
  payoutMethod: "mobile_money" | "bank_transfer" | "crypto_wallet";
  payoutProvider?: "paystack" | "cinetpay" | "stacks";
  payoutStatus?: "not_started" | "processing" | "success" | "failed";
  claimCodeHash?: string;
  stacksTxId?: string;
  claimStacksTxId?: string;
  refundStacksTxId?: string;
  status: "pending" | "claimed" | "refunded" | "failed";
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  refundedAt?: string;
  mobileMoneyRef?: string;
}

export interface User extends AuditFields {
  id: string;
  walletAddress: string;
  country: string;
  phoneNumber?: string;
  kycStatus: "none" | "pending" | "verified";
  createdAt: string;
  updatedAt: string;
}

export interface IdempotencyRecord {
  scope: "send" | "claim";
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  transferId?: string;
  createdByUid: string;
  createdAt: string;
  createdAtMs: number;
}

export interface AuthChallenge {
  walletAddress: string;
  nonce: string;
  message: string;
  createdAt: string;
  createdAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  usedAt?: string;
  usedAtMs?: number;
}

class Database {
  private transfers: Map<string, Transfer> = new Map();
  private users: Map<string, User> = new Map();
  private idempotency: Map<string, IdempotencyRecord> = new Map();
  private authChallenges: Map<string, AuthChallenge> = new Map();

  createTransfer(transfer: Transfer): Transfer {
    this.transfers.set(transfer.id, transfer);
    return transfer;
  }

  getTransfer(id: string): Transfer | undefined {
    return this.transfers.get(id);
  }

  updateTransfer(id: string, updates: Partial<Transfer>): Transfer | null {
    const existing = this.transfers.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.transfers.set(id, updated);
    return updated;
  }

  getTransfersBySender(sender: string): Transfer[] {
    return Array.from(this.transfers.values()).filter((t) => t.sender === sender);
  }

  getTransfersByReceiver(receiver: string): Transfer[] {
    return Array.from(this.transfers.values()).filter((t) => t.receiver === receiver);
  }

  getAllTransfers(): Transfer[] {
    return Array.from(this.transfers.values());
  }

  createUser(user: User): User {
    this.users.set(user.walletAddress, user);
    return user;
  }

  getUserByWallet(walletAddress: string): User | undefined {
    return this.users.get(walletAddress);
  }

  updateUser(walletAddress: string, updates: Partial<User>): User | null {
    const existing = this.users.get(walletAddress);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.users.set(walletAddress, updated);
    return updated;
  }

  getIdempotencyRecord(scope: IdempotencyRecord["scope"], key: string): IdempotencyRecord | undefined {
    return this.idempotency.get(`${scope}:${key}`);
  }

  saveIdempotencyRecord(record: IdempotencyRecord): IdempotencyRecord {
    this.idempotency.set(`${record.scope}:${record.key}`, record);
    return record;
  }

  saveAuthChallenge(challenge: AuthChallenge): AuthChallenge {
    this.authChallenges.set(challenge.walletAddress, challenge);
    return challenge;
  }

  getAuthChallenge(walletAddress: string): AuthChallenge | undefined {
    return this.authChallenges.get(walletAddress);
  }

  markAuthChallengeUsed(walletAddress: string, usedAt: string, usedAtMs: number): AuthChallenge | null {
    const existing = this.authChallenges.get(walletAddress);
    if (!existing) return null;

    const updated: AuthChallenge = {
      ...existing,
      usedAt,
      usedAtMs,
    };
    this.authChallenges.set(walletAddress, updated);
    return updated;
  }
}

export interface UserUpsertInput {
  walletAddress: string;
  country: string;
  phoneNumber?: string;
  kycStatus?: User["kycStatus"];
  actorUid: string;
}

export interface DatabaseAdapter {
  createTransfer(transfer: Transfer): Promise<Transfer>;
  getTransfer(id: string): Promise<Transfer | undefined>;
  updateTransfer(id: string, updates: Partial<Transfer>): Promise<Transfer | null>;
  getTransfersBySender(sender: string): Promise<Transfer[]>;
  getTransfersByReceiver(receiver: string): Promise<Transfer[]>;
  getAllTransfers(): Promise<Transfer[]>;
  upsertUser(input: UserUpsertInput): Promise<User>;
  getUserByWallet(walletAddress: string): Promise<User | undefined>;
  updateUser(walletAddress: string, updates: Partial<User>): Promise<User | null>;
  getIdempotencyRecord(scope: IdempotencyRecord["scope"], key: string): Promise<IdempotencyRecord | undefined>;
  saveIdempotencyRecord(record: IdempotencyRecord): Promise<IdempotencyRecord>;
  saveAuthChallenge(challenge: AuthChallenge): Promise<AuthChallenge>;
  getAuthChallenge(walletAddress: string): Promise<AuthChallenge | undefined>;
  markAuthChallengeUsed(walletAddress: string, usedAt: string, usedAtMs: number): Promise<AuthChallenge | null>;
}

class InMemoryDatabase implements DatabaseAdapter {
  private base = new Database();

  async createTransfer(transfer: Transfer): Promise<Transfer> {
    return this.base.createTransfer(transfer);
  }

  async getTransfer(id: string): Promise<Transfer | undefined> {
    return this.base.getTransfer(id);
  }

  async updateTransfer(id: string, updates: Partial<Transfer>): Promise<Transfer | null> {
    return this.base.updateTransfer(id, updates);
  }

  async getTransfersBySender(sender: string): Promise<Transfer[]> {
    return this.base.getTransfersBySender(sender);
  }

  async getTransfersByReceiver(receiver: string): Promise<Transfer[]> {
    return this.base.getTransfersByReceiver(receiver);
  }

  async getAllTransfers(): Promise<Transfer[]> {
    return this.base.getAllTransfers();
  }

  async upsertUser(input: UserUpsertInput): Promise<User> {
    const existing = this.base.getUserByWallet(input.walletAddress);
    const now = new Date();

    if (existing) {
      const updated = this.base.updateUser(input.walletAddress, {
        country: input.country,
        phoneNumber: input.phoneNumber ?? existing.phoneNumber,
        kycStatus: input.kycStatus ?? existing.kycStatus,
        updatedAt: now.toISOString(),
        updatedAtMs: now.getTime(),
        updatedByUid: input.actorUid,
      });
      return updated as User;
    }

    const user: User = {
      id: randomUUID(),
      walletAddress: input.walletAddress,
      country: input.country,
      phoneNumber: input.phoneNumber,
      kycStatus: input.kycStatus ?? "none",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdByUid: input.actorUid,
      updatedByUid: input.actorUid,
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
    };

    return this.base.createUser(user);
  }

  async getUserByWallet(walletAddress: string): Promise<User | undefined> {
    return this.base.getUserByWallet(walletAddress);
  }

  async updateUser(walletAddress: string, updates: Partial<User>): Promise<User | null> {
    return this.base.updateUser(walletAddress, updates);
  }

  async getIdempotencyRecord(
    scope: IdempotencyRecord["scope"],
    key: string
  ): Promise<IdempotencyRecord | undefined> {
    return this.base.getIdempotencyRecord(scope, key);
  }

  async saveIdempotencyRecord(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    return this.base.saveIdempotencyRecord(record);
  }

  async saveAuthChallenge(challenge: AuthChallenge): Promise<AuthChallenge> {
    return this.base.saveAuthChallenge(challenge);
  }

  async getAuthChallenge(walletAddress: string): Promise<AuthChallenge | undefined> {
    return this.base.getAuthChallenge(walletAddress);
  }

  async markAuthChallengeUsed(
    walletAddress: string,
    usedAt: string,
    usedAtMs: number
  ): Promise<AuthChallenge | null> {
    return this.base.markAuthChallengeUsed(walletAddress, usedAt, usedAtMs);
  }
}

class FirestoreDatabase implements DatabaseAdapter {
  private readonly firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  async createTransfer(transfer: Transfer): Promise<Transfer> {
    await this.firestore.collection("transfers").doc(transfer.id).set({
      ...transfer,
      createdAtServer: FieldValue.serverTimestamp(),
      updatedAtServer: FieldValue.serverTimestamp(),
    });
    return transfer;
  }

  async getTransfer(id: string): Promise<Transfer | undefined> {
    const snap = await this.firestore.collection("transfers").doc(id).get();
    return snap.exists ? (snap.data() as Transfer) : undefined;
  }

  async updateTransfer(id: string, updates: Partial<Transfer>): Promise<Transfer | null> {
    const ref = this.firestore.collection("transfers").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    await ref.set(
      {
        ...updates,
        updatedAtServer: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const updated = await ref.get();
    return updated.data() as Transfer;
  }

  async getTransfersBySender(sender: string): Promise<Transfer[]> {
    const snap = await this.firestore.collection("transfers").where("sender", "==", sender).get();
    return snap.docs.map((d) => d.data() as Transfer);
  }

  async getTransfersByReceiver(receiver: string): Promise<Transfer[]> {
    const snap = await this.firestore
      .collection("transfers")
      .where("receiver", "==", receiver)
      .get();
    return snap.docs.map((d) => d.data() as Transfer);
  }

  async getAllTransfers(): Promise<Transfer[]> {
    const snap = await this.firestore.collection("transfers").get();
    return snap.docs.map((d) => d.data() as Transfer);
  }

  async upsertUser(input: UserUpsertInput): Promise<User> {
    const ref = this.firestore.collection("users").doc(input.walletAddress);
    const snap = await ref.get();
    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    if (snap.exists) {
      const existing = snap.data() as User;
      const updated: User = {
        ...existing,
        country: input.country,
        phoneNumber: input.phoneNumber ?? existing.phoneNumber,
        kycStatus: input.kycStatus ?? existing.kycStatus,
        updatedAt: nowIso,
        updatedAtMs: nowMs,
        updatedByUid: input.actorUid,
      };
      await ref.set(
        {
          ...updated,
          updatedAtServer: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return updated;
    }

    const user: User = {
      id: randomUUID(),
      walletAddress: input.walletAddress,
      country: input.country,
      phoneNumber: input.phoneNumber,
      kycStatus: input.kycStatus ?? "none",
      createdAt: nowIso,
      updatedAt: nowIso,
      createdByUid: input.actorUid,
      updatedByUid: input.actorUid,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };

    await ref.set({
      ...user,
      createdAtServer: FieldValue.serverTimestamp(),
      updatedAtServer: FieldValue.serverTimestamp(),
    });
    return user;
  }

  async getUserByWallet(walletAddress: string): Promise<User | undefined> {
    const snap = await this.firestore.collection("users").doc(walletAddress).get();
    return snap.exists ? (snap.data() as User) : undefined;
  }

  async updateUser(walletAddress: string, updates: Partial<User>): Promise<User | null> {
    const ref = this.firestore.collection("users").doc(walletAddress);
    const snap = await ref.get();
    if (!snap.exists) return null;
    await ref.set(
      {
        ...updates,
        updatedAtServer: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const updated = await ref.get();
    return updated.data() as User;
  }

  async getIdempotencyRecord(
    scope: IdempotencyRecord["scope"],
    key: string
  ): Promise<IdempotencyRecord | undefined> {
    const snap = await this.firestore.collection("idempotency").doc(`${scope}:${key}`).get();
    return snap.exists ? (snap.data() as IdempotencyRecord) : undefined;
  }

  async saveIdempotencyRecord(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    await this.firestore.collection("idempotency").doc(`${record.scope}:${record.key}`).set({
      ...record,
      createdAtServer: FieldValue.serverTimestamp(),
    });
    return record;
  }

  async saveAuthChallenge(challenge: AuthChallenge): Promise<AuthChallenge> {
    await this.firestore.collection("authChallenges").doc(challenge.walletAddress).set({
      ...challenge,
      createdAtServer: FieldValue.serverTimestamp(),
      updatedAtServer: FieldValue.serverTimestamp(),
    });
    return challenge;
  }

  async getAuthChallenge(walletAddress: string): Promise<AuthChallenge | undefined> {
    const snap = await this.firestore.collection("authChallenges").doc(walletAddress).get();
    return snap.exists ? (snap.data() as AuthChallenge) : undefined;
  }

  async markAuthChallengeUsed(
    walletAddress: string,
    usedAt: string,
    usedAtMs: number
  ): Promise<AuthChallenge | null> {
    const ref = this.firestore.collection("authChallenges").doc(walletAddress);
    const snap = await ref.get();
    if (!snap.exists) return null;

    await ref.set(
      {
        usedAt,
        usedAtMs,
        updatedAtServer: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const updated = await ref.get();
    return updated.data() as AuthChallenge;
  }
}

export function assertFirestoreConfigForProduction(): void {
  assertFirebaseAdminConfiguredInProduction();
}

function createDatabaseAdapter(): DatabaseAdapter {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryDatabase();
  }

  assertFirestoreConfigForProduction();

  const firestoreEnabled = process.env.USE_FIRESTORE === "true" || isFirebaseAdminConfigured();

  if (!firestoreEnabled) {
    return new InMemoryDatabase();
  }

  initializeFirebaseAdminIfNeeded();

  return new FirestoreDatabase(getFirestore());
}

export const db: DatabaseAdapter = createDatabaseAdapter();
