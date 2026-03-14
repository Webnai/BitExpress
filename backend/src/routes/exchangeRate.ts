import { Router, Request, Response } from "express";
import {
  getExchangeRateLive,
  getBtcToLocalRateLive,
  getAllRatesLive,
} from "../services/fxService";
import { SUPPORTED_COUNTRIES } from "../config";

const router = Router();

/**
 * GET /api/exchange-rate
 * Get exchange rates for all supported countries.
 */
router.get("/", async (_req: Request, res: Response) => {
  const rates = await getAllRatesLive();
  return res.json({
    rates,
    supportedCountries: Object.entries(SUPPORTED_COUNTRIES).map(([code, country]) => ({
      code,
      name: country.name,
      currency: country.currency,
      currencySymbol: country.currencySymbol,
      mobileMoney: country.mobileMoney,
      flag: country.flag,
    })),
  });
});

/**
 * GET /api/exchange-rate/:country
 * Get exchange rate for a specific country (BTC → local currency).
 */
router.get("/:country", async (req: Request, res: Response) => {
  const { country } = req.params;
  const rate = await getBtcToLocalRateLive(country.toUpperCase());

  if (!rate) {
    return res.status(404).json({ error: `Unsupported country: ${country}` });
  }

  return res.json({ rate });
});

/**
 * POST /api/exchange-rate/convert
 * Convert amount between currencies.
 */
router.post("/convert", async (req: Request, res: Response) => {
  const { fromCurrency, toCurrency, amount } = req.body;

  if (!fromCurrency || !toCurrency || !amount) {
    return res.status(400).json({
      error: "Missing required fields: fromCurrency, toCurrency, amount",
    });
  }

  try {
    const rateInfo = await getExchangeRateLive(fromCurrency, toCurrency);
    const convertedAmount = Number(amount) * rateInfo.rate;

    return res.json({
      fromCurrency,
      toCurrency,
      fromAmount: Number(amount),
      toAmount: convertedAmount,
      rate: rateInfo.rate,
      updatedAt: rateInfo.updatedAt,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Conversion failed";
    return res.status(400).json({ error: msg });
  }
});

/**
 * GET /api/exchange-rate/estimate/:amountUsd
 * Estimate transfer amounts in local currencies for a given USD amount.
 */
router.get("/estimate/:amountUsd", async (req: Request, res: Response) => {
  const amountUsd = Number(req.params.amountUsd);
  if (isNaN(amountUsd) || amountUsd <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const estimates: Record<string, { localAmount: number; currency: string; flag: string }> = {};

  for (const [code, country] of Object.entries(SUPPORTED_COUNTRIES)) {
    try {
      const rate = await getBtcToLocalRateLive(code);
      if (rate) {
        const localPerUsd = rate.rate / rate.btcUsdPrice;
        estimates[code] = {
          localAmount: amountUsd * localPerUsd,
          currency: country.currency,
          flag: country.flag,
        };
      }
    } catch {
      // skip unsupported
    }
  }

  return res.json({ amountUsd, estimates });
});

export default router;
