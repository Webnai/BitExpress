// In-memory store simulating a Firebase database
// In production, replace with actual Firebase Firestore SDK

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

export const db = new Database();
