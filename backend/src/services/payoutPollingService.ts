import axios from "axios";
import { db } from "../db";
import { logError, logInfo } from "../utils/logging";
import {
  PAYSTACK_BASE_URL,
  PAYSTACK_SECRET_KEY,
} from "../config";

/**
 * Polls Paystack API for transfers stuck in "processing" state.
 * This is a fallback when webhooks fail to deliver.
 * Should be called periodically (e.g., every 5 minutes via a cron job).
 */

async function pollPaystackPayout(reference: string): Promise<"success" | "failed" | "processing"> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  const paystack = axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  const response = await paystack.get(`/transfer/verify/${reference}`);
  const status = String(response.data?.data?.status ?? "pending").toLowerCase();

  if (status === "success") return "success";
  if (status === "failed" || status === "reversed") return "failed";
  return "processing";
}

export async function pollProcessingPayouts(): Promise<void> {
  try {
    logInfo("payout_polling.started", {});

    const all = await db.getAllTransfers();
    const processing = all.filter((t) => t.payoutStatus === "processing" && t.mobileMoneyRef);

    if (processing.length === 0) {
      logInfo("payout_polling.no_pending", {});
      return;
    }

    logInfo("payout_polling.found_pending", { count: processing.length });

    for (const transfer of processing) {
      try {
        let status: "success" | "failed" | "processing" = "processing";

        if (transfer.payoutProvider === "paystack" && transfer.mobileMoneyRef) {
          status = await pollPaystackPayout(transfer.mobileMoneyRef);
        }

        if (status !== "processing") {
          const now = new Date();
          await db.updateTransfer(transfer.id, {
            payoutStatus: status,
            updatedAt: now.toISOString(),
            updatedAtMs: now.getTime(),
            updatedByUid: "system-polling",
          });

          logInfo("payout_polling.status_updated", {
            transferId: transfer.id,
            newStatus: status,
          });
        }
      } catch (error) {
        logError("payout_polling.error", {
          transferId: transfer.id,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    logInfo("payout_polling.completed", { processed: processing.length });
  } catch (error) {
    logError("payout_polling.critical_error", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
