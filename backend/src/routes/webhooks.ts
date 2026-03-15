import { Router, Request, Response } from "express";

import { logInfo } from "../utils/logging";

const router = Router();

router.post("/cinetpay/transfer", (req: Request, res: Response) => {
  logInfo("webhook.cinetpay.transfer.received", {
    provider: "cinetpay",
    payload: req.body,
  });

  res.json({ received: true });
});

router.post("/paystack/transfer", (req: Request, res: Response) => {
  logInfo("webhook.paystack.transfer.received", {
    provider: "paystack",
    payload: req.body,
  });

  res.json({ received: true });
});

export default router;