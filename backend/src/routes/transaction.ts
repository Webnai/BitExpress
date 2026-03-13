import { Router, Request, Response } from "express";
import { db } from "../db";
import { SUPPORTED_COUNTRIES, TRANSFER_TIMEOUT_MS } from "../config";
import { sendNotification } from "../services/notificationService";

const router = Router();

/**
 * GET /api/transaction/:id
 * Retrieve details for a specific transfer.
 */
router.get("/:id", (req: Request, res: Response) => {
  const { id } = req.params;

  const transfer = db.getTransfer(id);
  if (!transfer) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  const sourceCountryInfo = SUPPORTED_COUNTRIES[transfer.sourceCountry];
  const destCountryInfo = SUPPORTED_COUNTRIES[transfer.destCountry];

  return res.json({
    transaction: {
      id: transfer.id,
      sender: transfer.sender,
      receiver: transfer.receiver,
      amountUsd: transfer.amountUsd,
      fee: transfer.fee,
      netAmount: transfer.netAmount,
      currency: transfer.currency,
      sourceCountry: {
        code: transfer.sourceCountry,
        name: sourceCountryInfo?.name,
        flag: sourceCountryInfo?.flag,
        currency: sourceCountryInfo?.currency,
      },
      destCountry: {
        code: transfer.destCountry,
        name: destCountryInfo?.name,
        flag: destCountryInfo?.flag,
        currency: destCountryInfo?.currency,
        mobileMoney: destCountryInfo?.mobileMoney,
      },
      recipientPhone: transfer.recipientPhone,
      recipientName: transfer.recipientName,
      payoutMethod: transfer.payoutMethod,
      stacksTxId: transfer.stacksTxId,
      status: transfer.status,
      mobileMoneyRef: transfer.mobileMoneyRef,
      createdAt: transfer.createdAt,
      claimedAt: transfer.claimedAt,
      refundedAt: transfer.refundedAt,
    },
  });
});

/**
 * GET /api/transaction/wallet/:address
 * Get all transfers for a wallet address.
 */
router.get("/wallet/:address", (req: Request, res: Response) => {
  const { address } = req.params;

  const sent = db.getTransfersBySender(address);
  const received = db.getTransfersByReceiver(address);

  return res.json({
    sent: sent.map((t) => ({
      id: t.id,
      receiver: t.receiver,
      amountUsd: t.amountUsd,
      destCountry: t.destCountry,
      status: t.status,
      createdAt: t.createdAt,
    })),
    received: received.map((t) => ({
      id: t.id,
      sender: t.sender,
      amountUsd: t.netAmount,
      sourceCountry: t.sourceCountry,
      status: t.status,
      createdAt: t.createdAt,
    })),
  });
});

/**
 * POST /api/transaction/:id/refund
 * Request a refund for an expired transfer.
 */
router.post("/:id/refund", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { senderWallet } = req.body;

  const transfer = db.getTransfer(id);
  if (!transfer) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  if (transfer.sender !== senderWallet) {
    return res.status(403).json({ error: "Not authorized to refund this transfer" });
  }

  if (transfer.status !== "pending") {
    return res.status(400).json({
      error: `Cannot refund transfer with status: ${transfer.status}`,
    });
  }

  const createdAt = new Date(transfer.createdAt).getTime();
  const now = Date.now();

  if (now - createdAt < TRANSFER_TIMEOUT_MS) {
    return res.status(400).json({
      error: "Transfer has not yet expired. Refunds are available after 24 hours.",
    });
  }

  db.updateTransfer(id, {
    status: "refunded",
    refundedAt: new Date().toISOString(),
  });

  await sendNotification({
    to: transfer.sender,
    type: "sms",
    templateId: "transfer_refunded",
    data: {
      amount: transfer.amountUsd,
      transferId: id,
    },
  });

  return res.json({
    success: true,
    message: "Transfer refunded successfully",
    transferId: id,
    refundedAt: new Date().toISOString(),
  });
});

export default router;
