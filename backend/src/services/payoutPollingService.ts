import axios from "axios";
import { db } from "../db";
import { logError, logInfo } from "../utils/logging";
import {
  CINETPAY_API_KEY,
  CINETPAY_BASE_URL,
  CINETPAY_LANG,
  CINETPAY_TRANSFER_PASSWORD,
  PAYSTACK_BASE_URL,
  PAYSTACK_SECRET_KEY,
} from "../config";

/**
 * Polls payment provider APIs for transfers stuck in "processing" state.
 * This is a fallback when webhooks fail to deliver.
 * Should be called periodically (e.g., every 5 minutes via a cron job).
 */

async function getCinetToken(): Promise<string> {
  if (!CINETPAY_API_KEY || !CINETPAY_TRANSFER_PASSWORD) {
    throw new Error("CINETPAY_API_KEY and CINETPAY_TRANSFER_PASSWORD are required.");
  }

  const payload = new URLSearchParams({
    apikey: CINETPAY_API_KEY,
    password: CINETPAY_TRANSFER_PASSWORD,
  });

  const response = await axios.post(`${CINETPAY_BASE_URL}/v1/auth/login`, payload.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 15000,
  });

  const token = response.data?.data?.token;
  if (!token) {
    throw new Error(response.data?.message || "CinetPay authentication failed.");
  }

  return token;
}

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

async function pollCinetpayPayout(reference: string): Promise<"success" | "failed" | "processing"> {
  const token = await getCinetToken();
  const response = await axios.get(`${CINETPAY_BASE_URL}/v1/transfer/check/money`, {
    params: {
      token,
      lang: CINETPAY_LANG,
      client_transaction_id: reference,
    },
    timeout: 15000,
  });

  const result = Array.isArray(response.data?.data) ? response.data.data[0] : undefined;
  const treatmentStatus = String(result?.treatment_status ?? "NEW").toUpperCase();

  if (treatmentStatus === "VAL") return "success";
  if (treatmentStatus === "REJ") return "failed";
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
        } else if (transfer.payoutProvider === "cinetpay" && transfer.mobileMoneyRef) {
          status = await pollCinetpayPayout(transfer.mobileMoneyRef);
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
            payoutProvider: transfer.payoutProvider,
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
