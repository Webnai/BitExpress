import { Router, Request, Response } from "express";
import { db } from "../db";
import { SUPPORTED_COUNTRIES } from "../config";
import { convertUsdToLocal } from "../services/fxService";
import { processPayout } from "../services/payoutService";
import { sendNotification } from "../services/notificationService";

const router = Router();

/**
 * POST /api/claim
 * Claim a pending remittance and trigger mobile money payout.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { transferId, receiverWallet, claimCode } = req.body;

    if (!transferId || !receiverWallet) {
      return res.status(400).json({
        error: "Missing required fields: transferId, receiverWallet",
      });
    }

    const transfer = db.getTransfer(transferId);
    if (!transfer) {
      return res.status(404).json({ error: "Transfer not found" });
    }

    if (transfer.status !== "pending") {
      return res.status(400).json({
        error: `Transfer cannot be claimed. Current status: ${transfer.status}`,
      });
    }

    if (transfer.receiver !== receiverWallet) {
      return res.status(403).json({ error: "Not authorized to claim this transfer" });
    }

    // Convert USD to local currency
    const localAmount = convertUsdToLocal(transfer.netAmount, transfer.destCountry);

    // Process mobile money payout
    const payoutResult = await processPayout(
      {
        transferId,
        countryCode: transfer.destCountry,
        recipientPhone: transfer.recipientPhone || "",
        recipientName: transfer.recipientName || "Recipient",
        amountUsd: transfer.netAmount,
        payoutMethod: transfer.payoutMethod,
      },
      localAmount
    );

    if (!payoutResult.success) {
      return res.status(502).json({
        error: "Payout failed",
        details: payoutResult.message,
      });
    }

    // Update transfer status
    const updatedTransfer = db.updateTransfer(transferId, {
      status: "claimed",
      claimedAt: new Date().toISOString(),
      mobileMoneyRef: payoutResult.reference,
    });

    // Notify sender
    await sendNotification({
      to: transfer.sender,
      type: "sms",
      templateId: "transfer_claimed",
      data: {
        amount: transfer.amountUsd,
        recipientName: transfer.recipientName || "recipient",
        transferId,
      },
    });

    return res.json({
      success: true,
      transfer: {
        id: transferId,
        status: "claimed",
        claimedAt: updatedTransfer?.claimedAt,
        payout: {
          reference: payoutResult.reference,
          localAmount: payoutResult.localAmount,
          localCurrency: payoutResult.localCurrency,
          message: payoutResult.message,
          estimatedDelivery: payoutResult.estimatedDelivery,
        },
      },
    });
  } catch (error) {
    console.error("Claim error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
