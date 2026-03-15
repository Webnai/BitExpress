import { Router, Request, Response } from "express";

import { db } from "../db";
import { SUPPORTED_COUNTRIES, TRANSFER_TIMEOUT_MS } from "../config";
import { requireAuth } from "../middleware/auth";
import { sendNotification } from "../services/notificationService";
import { verifyRefundRemittanceTx } from "../services/stacksVerificationService";
import { logRequestInfo } from "../utils/logging";

const router = Router();

router.get("/wallet/:address", requireAuth, async (req: Request, res: Response) => {
  const { address } = req.params;
  const authenticatedWallet = req.auth?.walletAddress;

  if (!authenticatedWallet || authenticatedWallet !== address) {
    res.status(403).json({ error: "Not authorized to view this wallet history." });
    return;
  }

  const sent = await db.getTransfersBySender(address);
  const received = await db.getTransfersByReceiver(address);

  res.json({
    sent: sent
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((t) => ({
        id: t.id,
        direction: "sent",
        counterpartyWallet: t.receiver,
        counterpartyName: t.recipientName,
        amountUsd: t.amountUsd,
        fee: t.fee,
        netAmount: t.netAmount,
        countryCode: t.destCountry,
        countryName: SUPPORTED_COUNTRIES[t.destCountry]?.name,
        payoutMethod: t.payoutMethod,
        recipientMobileProvider: t.recipientMobileProvider,
        payoutProvider: t.payoutProvider,
        payoutStatus: t.payoutStatus,
        status: t.status,
        onChainTransferId: t.onChainTransferId,
        stacksTxId: t.stacksTxId,
        claimStacksTxId: t.claimStacksTxId,
        refundStacksTxId: t.refundStacksTxId,
        createdAt: t.createdAt,
        claimedAt: t.claimedAt,
        mobileMoneyRef: t.mobileMoneyRef,
      })),
    received: received
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((t) => ({
        id: t.id,
        direction: "received",
        counterpartyWallet: t.sender,
        counterpartyName: t.recipientName,
        amountUsd: t.netAmount,
        fee: t.fee,
        netAmount: t.netAmount,
        countryCode: t.sourceCountry,
        countryName: SUPPORTED_COUNTRIES[t.sourceCountry]?.name,
        payoutMethod: t.payoutMethod,
        recipientMobileProvider: t.recipientMobileProvider,
        payoutProvider: t.payoutProvider,
        payoutStatus: t.payoutStatus,
        status: t.status,
        onChainTransferId: t.onChainTransferId,
        stacksTxId: t.stacksTxId,
        claimStacksTxId: t.claimStacksTxId,
        refundStacksTxId: t.refundStacksTxId,
        createdAt: t.createdAt,
        claimedAt: t.claimedAt,
        mobileMoneyRef: t.mobileMoneyRef,
      })),
  });
});

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const transfer = await db.getTransfer(id);
  if (!transfer) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  const sourceCountryInfo = SUPPORTED_COUNTRIES[transfer.sourceCountry];
  const destCountryInfo = SUPPORTED_COUNTRIES[transfer.destCountry];

  res.json({
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
      recipientMobileProvider: transfer.recipientMobileProvider,
      payoutMethod: transfer.payoutMethod,
      payoutProvider: transfer.payoutProvider,
      payoutStatus: transfer.payoutStatus,
      onChainTransferId: transfer.onChainTransferId,
      stacksTxId: transfer.stacksTxId,
      claimStacksTxId: transfer.claimStacksTxId,
      refundStacksTxId: transfer.refundStacksTxId,
      status: transfer.status,
      mobileMoneyRef: transfer.mobileMoneyRef,
      createdAt: transfer.createdAt,
      claimedAt: transfer.claimedAt,
      refundedAt: transfer.refundedAt,
    },
  });
});

router.post("/:id/refund", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const senderWallet = req.auth?.walletAddress;
  const actorUid = req.auth?.uid;

  if (!senderWallet || !actorUid) {
    res.status(401).json({ error: "Missing authenticated wallet context." });
    return;
  }

  const { refundStacksTxId } = req.body as { refundStacksTxId?: string };

  const transfer = await db.getTransfer(id);
  if (!transfer) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (transfer.sender !== senderWallet) {
    res.status(403).json({ error: "Not authorized to refund this transfer" });
    return;
  }

  if (transfer.status !== "pending") {
    res.status(400).json({
      error: `Cannot refund transfer with status: ${transfer.status}`,
    });
    return;
  }

  const createdAt = new Date(transfer.createdAt).getTime();
  const nowMs = Date.now();

  if (nowMs - createdAt < TRANSFER_TIMEOUT_MS) {
    res.status(400).json({
      error: "Transfer has not yet expired. Refunds are available after 24 hours.",
    });
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    if (!refundStacksTxId) {
      res.status(400).json({
        error: "refundStacksTxId is required and must reference a successful refund-remittance transaction.",
      });
      return;
    }

    if (transfer.onChainTransferId === undefined) {
      res.status(400).json({
        error: "Transfer is missing on-chain transfer ID and cannot be verified for refund.",
      });
      return;
    }

    const verification = await verifyRefundRemittanceTx({
      txId: refundStacksTxId,
      senderWallet,
      expectedOnChainTransferId: transfer.onChainTransferId,
    });

    if (!verification.ok) {
      res.status(400).json({
        error: verification.reason || "Invalid refundStacksTxId for this refund.",
      });
      return;
    }
  }

  const now = new Date();

  await db.updateTransfer(id, {
    status: "refunded",
    refundStacksTxId,
    refundedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime(),
    updatedByUid: actorUid,
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

  logRequestInfo(req, "transfer.refunded", {
    transferId: id,
    senderWallet,
  });

  res.json({
    success: true,
    message: "Transfer refunded successfully",
    transferId: id,
    refundStacksTxId,
    refundedAt: now.toISOString(),
  });
});

export default router;
