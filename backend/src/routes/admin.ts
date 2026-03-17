import { Router, Request, Response } from "express";
import { db } from "../db";
import { logRequestError, logRequestInfo } from "../utils/logging";

const router = Router();

/**
 * Manual override endpoint for support team.
 * Allows marking transfers as successfully paid out when payment processors fail.
 * 
 * Requires ADMIN_SECRET_KEY for authentication.
 */

function requireAdminSecret(req: Request, res: Response): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) {
    logRequestError(req, "admin.disabled", {
      message: "ADMIN_SECRET_KEY not configured",
    });
    res.status(503).json({ error: "Admin operations disabled" });
    return false;
  }

  const provided = req.headers["x-admin-key"];
  if (provided !== adminSecret) {
    logRequestError(req, "admin.unauthorized", {});
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

/**
 * Mark a transfer as successfully paid out (manual override).
 * 
 * POST /api/admin/transfers/:id/mark-paid
 * Headers: X-Admin-Key: <ADMIN_SECRET_KEY>
 * Body: { reference?: string; provider?: string }
 */
router.post("/transfers/:id/mark-paid", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;

  const { id } = req.params;
  const { reference, provider } = req.body as { reference?: string; provider?: string };

  if (!id) {
    res.status(400).json({ error: "Transfer ID is required" });
    return;
  }

  try {
    const transfer = await db.getTransfer(id);
    if (!transfer) {
      res.status(404).json({ error: "Transfer not found" });
      return;
    }

    if (transfer.payoutStatus === "success") {
      logRequestInfo(req, "admin.transfer_already_paid", { transferId: id });
      res.status(400).json({ error: "Transfer is already marked as paid" });
      return;
    }

    const now = new Date();
    const updated = await db.updateTransfer(id, {
      payoutStatus: "success",
      mobileMoneyRef: reference || transfer.mobileMoneyRef,
      payoutProvider: (provider as any) || transfer.payoutProvider,
      updatedAt: now.toISOString(),
      updatedAtMs: now.getTime(),
      updatedByUid: process.env.ADMIN_UID || "admin-manual",
    });

    logRequestInfo(req, "admin.transfer_marked_paid", {
      transferId: id,
      provider: provider || transfer.payoutProvider,
    });

    res.json({
      success: true,
      message: "Transfer marked as paid",
      transfer: {
        id: updated?.id,
        status: updated?.status,
        payoutStatus: updated?.payoutStatus,
      },
    });
  } catch (error) {
    logRequestError(req, "admin.transfer_mark_paid.failed", {
      transferId: id,
      message: error instanceof Error ? error.message : "unknown",
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Mark a transfer as failed (manual override).
 * 
 * POST /api/admin/transfers/:id/mark-failed
 * Headers: X-Admin-Key: <ADMIN_SECRET_KEY>
 * Body: { reason?: string }
 */
router.post("/transfers/:id/mark-failed", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;

  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  if (!id) {
    res.status(400).json({ error: "Transfer ID is required" });
    return;
  }

  try {
    const transfer = await db.getTransfer(id);
    if (!transfer) {
      res.status(404).json({ error: "Transfer not found" });
      return;
    }

    if (transfer.payoutStatus === "failed") {
      logRequestInfo(req, "admin.transfer_already_failed", { transferId: id });
      res.status(400).json({ error: "Transfer is already marked as failed" });
      return;
    }

    const now = new Date();
    const updated = await db.updateTransfer(id, {
      payoutStatus: "failed",
      updatedAt: now.toISOString(),
      updatedAtMs: now.getTime(),
      updatedByUid: process.env.ADMIN_UID || "admin-manual",
    });

    logRequestInfo(req, "admin.transfer_marked_failed", {
      transferId: id,
      reason: reason || "no reason provided",
    });

    res.json({
      success: true,
      message: "Transfer marked as failed",
      transfer: {
        id: updated?.id,
        status: updated?.status,
        payoutStatus: updated?.payoutStatus,
      },
    });
  } catch (error) {
    logRequestError(req, "admin.transfer_mark_failed.failed", {
      transferId: id,
      message: error instanceof Error ? error.message : "unknown",
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Get transfer details (with admin access).
 * 
 * GET /api/admin/transfers/:id
 * Headers: X-Admin-Key: <ADMIN_SECRET_KEY>
 */
router.get("/transfers/:id", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;

  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: "Transfer ID is required" });
    return;
  }

  try {
    const transfer = await db.getTransfer(id);
    if (!transfer) {
      res.status(404).json({ error: "Transfer not found" });
      return;
    }

    res.json({ success: true, transfer });
  } catch (error) {
    logRequestError(req, "admin.get_transfer.failed", {
      transferId: id,
      message: error instanceof Error ? error.message : "unknown",
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
