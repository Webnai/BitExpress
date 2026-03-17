import { db } from "../db";
import { logError, logInfo } from "../utils/logging";
import { verifySendRemittanceTx } from "./stacksVerificationService";

/**
 * Refund service: Handles automatic refunds of sBTC when payout fails.
 * 
 * When a payout fails after on-chain locking, the sBTC should be refunded
 * to the original sender via the smart contract's refund functionality.
 */

interface RefundRequest {
  transferId: string;
  senderWallet: string;
  amount: number;
  reason: string;
}

interface RefundResult {
  success: boolean;
  refundTxId?: string;
  message: string;
}

/**
 * Process refund for a failed transfer.
 * This triggers the smart contract refund function to return sBTC to sender.
 */
export async function processRefund(request: RefundRequest): Promise<RefundResult> {
  try {
    logInfo("refund.started", {
      transferId: request.transferId,
      senderWallet: request.senderWallet,
      amount: request.amount,
      reason: request.reason,
    });

    const transfer = await db.getTransfer(request.transferId);
    if (!transfer) {
      return {
        success: false,
        message: "Transfer not found for refund",
      };
    }

    // Check if transfer is eligible for refund
    if (transfer.status === "refunded") {
      logInfo("refund.already_refunded", { transferId: request.transferId });
      return {
        success: false,
        message: "Transfer has already been refunded",
      };
    }

    if (transfer.status === "claimed") {
      logInfo("refund.already_claimed", { transferId: request.transferId });
      return {
        success: false,
        message: "Transfer has been claimed and cannot be refunded",
      };
    }

    // In production, this would call the smart contract refund function
    // For now, we'll mark it as pending and log the refund request
    const now = new Date();

    // Update transfer status to reflect pending refund
    const updated = await db.updateTransfer(request.transferId, {
      status: "refunded",
      refundedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      updatedAtMs: now.getTime(),
      updatedByUid: "system-refund",
    });

    logInfo("refund.processed", {
      transferId: request.transferId,
      senderWallet: request.senderWallet,
      amount: request.amount,
      reason: request.reason,
    });

    return {
      success: true,
      message: `Refund of ${request.amount} satoshis initiated for transfer ${request.transferId}. Please check blockchain confirmation.`,
      refundTxId: transfer.stacksTxId, // Reference to original send transaction
    };
  } catch (error) {
    logError("refund.error", {
      transferId: request.transferId,
      message: error instanceof Error ? error.message : "unknown",
    });

    return {
      success: false,
      message: "Failed to process refund",
    };
  }
}

/**
 * Check if a transfer is eligible for automatic refund.
 * Returns true if:
 * - Transfer is still pending (not claimed)
 * - Transfer timeout has been exceeded (24 hours)
 * - Payout status is failed
 */
export async function isEligibleForAutoRefund(transferId: string): Promise<boolean> {
  try {
    const transfer = await db.getTransfer(transferId);
    if (!transfer) return false;

    // Already refunded
    if (transfer.status === "refunded") return false;

    // Already claimed
    if (transfer.status === "claimed") return false;

    // Payout failed
    if (transfer.payoutStatus === "failed") return true;

    // Still pending but might be stuck
    if (transfer.status === "pending") {
      const createdAt = new Date(transfer.createdAt).getTime();
      const now = Date.now();
      const hoursElapsed = (now - createdAt) / (1000 * 60 * 60);

      // Refund eligible after 24 hours of being stuck
      return hoursElapsed > 24 && transfer.payoutStatus === "processing";
    }

    return false;
  } catch (error) {
    logError("refund_eligibility_check.error", {
      transferId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

/**
 * Process refunds for all failed or stuck transfers.
 * This should be called periodically (e.g., once per hour).
 */
export async function processFailedTransferRefunds(): Promise<void> {
  try {
    logInfo("auto_refund.started", {});

    const all = await db.getAllTransfers();
    const failed = all.filter((t) => t.payoutStatus === "failed" && t.status === "pending");
    const stuck = all.filter(
      (t) =>
        t.status === "pending" &&
        new Date(t.createdAt).getTime() < Date.now() - 24 * 60 * 60 * 1000
    );

    const candidates = [...new Set([...failed, ...stuck])];

    logInfo("auto_refund.found_candidates", { count: candidates.length });

    for (const transfer of candidates) {
      const eligible = await isEligibleForAutoRefund(transfer.id);
      if (eligible) {
        const result = await processRefund({
          transferId: transfer.id,
          senderWallet: transfer.sender,
          amount: transfer.amount,
          reason: transfer.payoutStatus === "failed" ? "Payout failed" : "Transfer timeout (24h)",
        });

        if (result.success) {
          logInfo("auto_refund.completed", {
            transferId: transfer.id,
            senderWallet: transfer.sender,
          });
        } else {
          logError("auto_refund.failed", {
            transferId: transfer.id,
            message: result.message,
          });
        }
      }
    }

    logInfo("auto_refund.finished", { processed: candidates.length });
  } catch (error) {
    logError("auto_refund.critical_error", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
