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

export function microStxToUsd(microStx: number): number {
  // 1 STX ≈ $2.00 (simulated price)
  const STX_USD_PRICE = 2.0;
  return (microStx / 1_000_000) * STX_USD_PRICE;
}

export function usdToMicroStx(usd: number): number {
  const STX_USD_PRICE = 2.0;
  return Math.floor((usd / STX_USD_PRICE) * 1_000_000);
}
