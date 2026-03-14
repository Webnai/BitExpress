import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { SUPPORTED_COUNTRIES, PLATFORM_FEE_BASIS_POINTS, BASIS_POINTS_DENOMINATOR } from "../config";
import { convertUsdToLocal, usdToMicroStx } from "../services/fxService";
import { sendNotification } from "../services/notificationService";

const router = Router();

/**
 * POST /api/send
 * Initiate a cross-border remittance transfer.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      senderWallet,
      receiverWallet,
      amountUsd,
      sourceCountry,
      destCountry,
      recipientPhone,
      recipientName,
      payoutMethod = "mobile_money",
      stacksTxId,
    } = req.body;

    // Validate required fields
    if (!senderWallet || !receiverWallet || !amountUsd || !sourceCountry || !destCountry) {
      return res.status(400).json({
        error: "Missing required fields: senderWallet, receiverWallet, amountUsd, sourceCountry, destCountry",
      });
    }

    // Validate countries
    if (!SUPPORTED_COUNTRIES[sourceCountry]) {
      return res.status(400).json({ error: `Unsupported source country: ${sourceCountry}` });
    }
    if (!SUPPORTED_COUNTRIES[destCountry]) {
      return res.status(400).json({ error: `Unsupported destination country: ${destCountry}` });
    }

    // Validate amount
    const amount = Number(amountUsd);
    if (isNaN(amount) || amount < 1 || amount > 10000) {
      return res.status(400).json({ error: "Amount must be between $1 and $10,000" });
    }

    // Calculate fee (1%)
    const fee = (amount * PLATFORM_FEE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;
    const netAmount = amount - fee;
    const microStxAmount = usdToMicroStx(amount);

    const transferId = uuidv4();

    const transfer = await db.createTransfer({
      id: transferId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: microStxAmount,
      amountUsd: amount,
      fee,
      netAmount,
      currency: "sBTC",
      sourceCountry,
      destCountry,
      recipientPhone,
      recipientName,
      payoutMethod,
      stacksTxId,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    await Promise.all([
      db.upsertUser({
        walletAddress: senderWallet,
        country: sourceCountry,
      }),
      db.upsertUser({
        walletAddress: receiverWallet,
        country: destCountry,
        phoneNumber: recipientPhone,
      }),
    ]);

    // Send notifications
    if (recipientPhone) {
      await sendNotification({
        to: recipientPhone,
        type: "sms",
        templateId: "transfer_received",
        data: {
          amount: netAmount.toFixed(2),
          senderCountry: SUPPORTED_COUNTRIES[sourceCountry].name,
          claimCode: transferId.slice(0, 8).toUpperCase(),
          transferId,
        },
      });
    }

    return res.status(201).json({
      success: true,
      transfer: {
        id: transfer.id,
        status: transfer.status,
        amount: transfer.amountUsd,
        fee: transfer.fee,
        netAmount: transfer.netAmount,
        sourceCountry,
        destCountry,
        createdAt: transfer.createdAt,
      },
    });
  } catch (error) {
    console.error("Send error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
