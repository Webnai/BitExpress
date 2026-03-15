import axios from "axios";

import { SUPPORTED_COUNTRIES } from "../config";

// Simulated FX rates (BTC per 1 unit of local currency)
// TODO: In production, replace with a live price feed (e.g., CoinGecko, Binance API)
// This can also be overridden via BTC_USD_PRICE environment variable for testing
const MOCK_BTC_PRICE_USD = process.env.BTC_USD_PRICE
  ? Number(process.env.BTC_USD_PRICE)
  : 65000; // 1 BTC = $65,000 (mock)

// USD to local currency exchange rates (approximate)
const USD_RATES: Record<string, number> = {
  USD: 1,
  GHS: 15.5, // 1 USD = 15.5 GHS
  NGN: 1600, // 1 USD = 1600 NGN
  KES: 132, // 1 USD = 132 KES
  XOF: 620, // 1 USD = 620 XOF (used by Togo, Senegal)
  TZS: 2600, // 1 USD = 2600 TZS
  UGX: 3800, // 1 USD = 3800 UGX
};

const RATE_CACHE_TTL_MS = 5 * 60 * 1000;

interface LiveRateSnapshot {
  btcUsdPrice: number;
  usdRates: Record<string, number>;
  updatedAt: string;
}

let cachedSnapshot: LiveRateSnapshot | null = null;
let cachedAt = 0;

export interface ExchangeRateResponse {
  from: string;
  to: string;
  rate: number;
  btcUsdPrice: number;
  updatedAt: string;
}

export interface ConversionResult {
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  rate: number;
  feeUsd: number;
  netUsdAmount: number;
}

function getUsdRate(currency: string): number {
  const rate = USD_RATES[currency];
  if (!rate) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return rate;
}

async function fetchLiveRateSnapshot(): Promise<LiveRateSnapshot> {
  if (cachedSnapshot && Date.now() - cachedAt < RATE_CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  try {
    const [btcPriceResponse, usdRatesResponse] = await Promise.all([
      axios.get("https://api.coingecko.com/api/v3/simple/price", {
        params: { ids: "bitcoin", vs_currencies: "usd" },
        timeout: 5000,
      }),
      axios.get("https://open.er-api.com/v6/latest/USD", {
        timeout: 5000,
      }),
    ]);

    const btcUsdPrice = Number(btcPriceResponse.data?.bitcoin?.usd);
    const rates = usdRatesResponse.data?.rates as Record<string, number> | undefined;

    if (!btcUsdPrice || !rates) {
      throw new Error("Invalid live FX response");
    }

    cachedSnapshot = {
      btcUsdPrice,
      usdRates: rates,
      updatedAt: new Date().toISOString(),
    };
    cachedAt = Date.now();
    return cachedSnapshot;
  } catch {
    const fallbackSnapshot: LiveRateSnapshot = {
      btcUsdPrice: MOCK_BTC_PRICE_USD,
      usdRates: USD_RATES,
      updatedAt: new Date().toISOString(),
    };
    cachedSnapshot = fallbackSnapshot;
    cachedAt = Date.now();
    return fallbackSnapshot;
  }
}

export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): ExchangeRateResponse {
  const fromUsd = getUsdRate(fromCurrency);
  const toUsd = getUsdRate(toCurrency);

  // Rate: how many toCurrency units per 1 fromCurrency unit
  const rate = toUsd / fromUsd;

  return {
    from: fromCurrency,
    to: toCurrency,
    rate,
    btcUsdPrice: MOCK_BTC_PRICE_USD,
    updatedAt: new Date().toISOString(),
  };
}

export function getBtcToLocalRate(
  countryCode: string
): ExchangeRateResponse | null {
  const country = SUPPORTED_COUNTRIES[countryCode];
  if (!country) return null;

  const localCurrency = country.currency;
  const usdRate = getUsdRate(localCurrency);

  // 1 BTC = btcUsdPrice USD = btcUsdPrice * usdRate localCurrency
  const rate = MOCK_BTC_PRICE_USD * usdRate;

  return {
    from: "BTC",
    to: localCurrency,
    rate,
    btcUsdPrice: MOCK_BTC_PRICE_USD,
    updatedAt: new Date().toISOString(),
  };
}

export function convertUsdToLocal(
  amountUsd: number,
  countryCode: string
): number {
  const country = SUPPORTED_COUNTRIES[countryCode];
  if (!country) throw new Error(`Unsupported country: ${countryCode}`);

  const usdRate = getUsdRate(country.currency);
  return amountUsd * usdRate;
}

export function getAllRates(): Record<string, ExchangeRateResponse> {
  const rates: Record<string, ExchangeRateResponse> = {};

  for (const [code, country] of Object.entries(SUPPORTED_COUNTRIES)) {
    const btcRate = getBtcToLocalRate(code);
    if (btcRate) {
      rates[code] = btcRate;
    }
  }

  return rates;
}

export async function getExchangeRateLive(
  fromCurrency: string,
  toCurrency: string
): Promise<ExchangeRateResponse> {
  const snapshot = await fetchLiveRateSnapshot();
  const fromUsd = snapshot.usdRates[fromCurrency] ?? getUsdRate(fromCurrency);
  const toUsd = snapshot.usdRates[toCurrency] ?? getUsdRate(toCurrency);

  return {
    from: fromCurrency,
    to: toCurrency,
    rate: toUsd / fromUsd,
    btcUsdPrice: snapshot.btcUsdPrice,
    updatedAt: snapshot.updatedAt,
  };
}

export async function getBtcToLocalRateLive(
  countryCode: string
): Promise<ExchangeRateResponse | null> {
  const country = SUPPORTED_COUNTRIES[countryCode];
  if (!country) return null;

  const snapshot = await fetchLiveRateSnapshot();
  const usdRate = snapshot.usdRates[country.currency] ?? getUsdRate(country.currency);

  return {
    from: "BTC",
    to: country.currency,
    rate: snapshot.btcUsdPrice * usdRate,
    btcUsdPrice: snapshot.btcUsdPrice,
    updatedAt: snapshot.updatedAt,
  };
}

export async function getAllRatesLive(): Promise<Record<string, ExchangeRateResponse>> {
  const rates: Record<string, ExchangeRateResponse> = {};

  for (const [code] of Object.entries(SUPPORTED_COUNTRIES)) {
    const rate = await getBtcToLocalRateLive(code);
    if (rate) rates[code] = rate;
  }

  return rates;
}

export function microStxToUsd(microStx: number): number {
  // 1 STX ≈ $2.00 (simulated price)
  const STX_USD_PRICE = 2.0;
  return (microStx / 1_000_000) * STX_USD_PRICE;
}

export function usdToUsdcxBaseUnits(usd: number): number {
  // USDCx has 6 decimals and is 1:1 with USD.
  return Math.floor(usd * 1_000_000);
}

export function usdcxBaseUnitsToUsd(units: number): number {
  return units / 1_000_000;
}
