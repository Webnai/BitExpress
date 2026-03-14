import { randomUUID } from "crypto";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

export interface Transfer {
  id: string;
  sender: string;
  receiver: string;
  amount: number; // in microSTX / satoshis
  amountUsd: number;
  fee: number;
  netAmount: number;
  currency: string;
  sourceCountry: string;
  destCountry: string;
  recipientPhone?: string;
  recipientName?: string;
  payoutMethod: "mobile_money" | "bank_transfer" | "crypto_wallet";
  claimCodeHash?: string;
  stacksTxId?: string;
  status: "pending" | "claimed" | "refunded" | "failed";
  createdAt: string;
  claimedAt?: string;
  refundedAt?: string;
  mobileMoneyRef?: string;
}

export interface User {
  id: string;
  walletAddress: string;
  country: string;
  phoneNumber?: string;
  kycStatus: "none" | "pending" | "verified";
  createdAt: string;
}

class Database {
  private transfers: Map<string, Transfer> = new Map();
  private users: Map<string, User> = new Map();

  // Transfer operations
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
    return Array.from(this.transfers.values()).filter(
      (t) => t.sender === sender
    );
  }

  getTransfersByReceiver(receiver: string): Transfer[] {
    return Array.from(this.transfers.values()).filter(
      (t) => t.receiver === receiver
    );
  }

  getAllTransfers(): Transfer[] {
    return Array.from(this.transfers.values());
  }

  // User operations
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
}

export interface UserUpsertInput {
  walletAddress: string;
  country: string;
  phoneNumber?: string;
  kycStatus?: User["kycStatus"];
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
    if (existing) {
      const updated = this.base.updateUser(input.walletAddress, {
        country: input.country,
        phoneNumber: input.phoneNumber ?? existing.phoneNumber,
        kycStatus: input.kycStatus ?? existing.kycStatus,
      });
      return updated as User;
    }

    const user: User = {
      id: randomUUID(),
      walletAddress: input.walletAddress,
      country: input.country,
      phoneNumber: input.phoneNumber,
      kycStatus: input.kycStatus ?? "none",
      createdAt: new Date().toISOString(),
    };

    return this.base.createUser(user);
  }

  async getUserByWallet(walletAddress: string): Promise<User | undefined> {
    return this.base.getUserByWallet(walletAddress);
  }

  async updateUser(walletAddress: string, updates: Partial<User>): Promise<User | null> {
    return this.base.updateUser(walletAddress, updates);
  }
}

class FirestoreDatabase implements DatabaseAdapter {
  private readonly firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  async createTransfer(transfer: Transfer): Promise<Transfer> {
    await this.firestore.collection("transfers").doc(transfer.id).set(transfer);
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
    await ref.set(updates, { merge: true });
    const updated = await ref.get();
    return updated.data() as Transfer;
  }

  async getTransfersBySender(sender: string): Promise<Transfer[]> {
    const snap = await this.firestore
      .collection("transfers")
      .where("sender", "==", sender)
      .get();
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
    const now = new Date().toISOString();

    if (snap.exists) {
      const existing = snap.data() as User;
      const updated: User = {
        ...existing,
        country: input.country,
        phoneNumber: input.phoneNumber ?? existing.phoneNumber,
        kycStatus: input.kycStatus ?? existing.kycStatus,
      };
      await ref.set(updated, { merge: true });
      return updated;
    }

    const user: User = {
      id: randomUUID(),
      walletAddress: input.walletAddress,
      country: input.country,
      phoneNumber: input.phoneNumber,
      kycStatus: input.kycStatus ?? "none",
      createdAt: now,
    };

    await ref.set(user);
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
    await ref.set(updates, { merge: true });
    const updated = await ref.get();
    return updated.data() as User;
  }
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function getServiceAccountFromEnv():
  | { projectId: string; clientEmail: string; privateKey: string }
  | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return null;
    }

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key),
    };
  } catch {
    return null;
  }
}

function createDatabaseAdapter(): DatabaseAdapter {
  if (process.env.NODE_ENV === "test") {
    return new InMemoryDatabase();
  }

  const serviceAccount = getServiceAccountFromEnv();
  const firestoreEnabled =
    process.env.USE_FIRESTORE === "true" || Boolean(serviceAccount) || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

  if (!firestoreEnabled) {
    return new InMemoryDatabase();
  }

  if (!getApps().length) {
    if (serviceAccount) {
      initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
      });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }

  return new FirestoreDatabase(getFirestore());
}

export const db: DatabaseAdapter = createDatabaseAdapter();
