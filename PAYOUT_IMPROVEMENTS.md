# BitExpress Payout System Improvements - Implementation Summary

## Overview
Implemented 6 major fixes to make the mobile money payout system production-ready with proper liquidity handling, fallback mechanisms, and automatic refunds.

---

## 1. **Live FX Rate Integration** ✅

### What Was Fixed
- Replaced hardcoded mock FX rates with live market data
- Integrated with CoinGecko (Bitcoin prices) and OpenExchangeRates (currency conversions)
- Added 5-minute caching to avoid excessive API calls
- Fallback to mock rates if live APIs fail

### Implementation Details
**File: `backend/src/services/fxService.ts`**
- `fetchLiveRateSnapshot()` - Fetches live rates from CoinGecko & OpenER with fallback
- `convertUsdToLocalLive()` - New async function using live rates  
- `getBtcToLocalRateLive()` - Get live Bitcoin to local currency rates

**Updated File: `backend/src/routes/claim.ts`**
- Claims now use `convertUsdToLocalLive()` instead of mocked rates
- Accurate payout amounts based on real-time market prices

### Why This Matters
Without live rates, users could receive significantly different amounts than expected (e.g., quoted $100 USD but receive outdated rate-based payout).

---

## 2. **Liquidity Checks Before Payout** ✅

### What Was Fixed
- Added balance verification to Paystack, Cinetpay, and Flutterwave before initiating payouts
- Prevents failed payouts after successful on-chain transfer
- Returns meaningful error messages for liquidity issues

### Implementation Details
**File: `backend/src/services/payoutService.ts`**

Three new liquidity check functions:
```typescript
async function checkPaystackLiquidity(countryCode: string, localAmount: number): Promise<boolean>
async function checkCinetpayLiquidity(countryCode: string, localAmount: number): Promise<boolean>
async function checkFlutterwaveLiquidity(countryCode: string, localAmount: number): Promise<boolean>
```

These functions:
- Query the payment processor's balance API
- Return true only if sufficient funds available
- Return false on API errors (safe conservative approach)

### When It's Used
In `processPayout()`, before calling each provider:
```typescript
if (country.mobileMoneyProvider === "paystack") {
  const paystackHasLiquidity = await checkPaystackLiquidity(countryCode, localAmount);
  if (!paystackHasLiquidity) {
    return { success: false, message: "Insufficient liquidity..." };
  }
}
```

### Why This Matters
**Scenario Without This Fix:**
1. User claims sBTC on-chain (succeeds, funds locked in receiver's wallet)
2. Backend tries to pay out NGN 100,000 to mobile money
3. Paystack doesn't have NGN in stock
4. Payout fails with generic error
5. User has sBTC but can't claim cash → stuck

**With This Fix:**
1. User claims sBTC on-chain
2. Backend checks: "Does Paystack have ≥100,000 NGN?" → No
3. Return error before even attempting payout
4. Refund process triggered automatically

---

## 3. **Webhook Polling Fallback** ✅

### What Was Fixed
- Added periodic polling for transfers stuck in "processing" state
- Fallback when webhooks from payment processors fail to deliver
- Automatic status updates every 5 minutes

### Implementation Details
**New File: `backend/src/services/payoutPollingService.ts`**

Main function: `pollProcessingPayouts()`
- Queries all transfers where `payoutStatus === "processing"`
- Calls payment provider APIs to check actual status
- Updates Firestore immediately when status changes

For each provider:
- **Paystack**: `GET /transfer/verify/{reference}`
- **CinetPay**: `GET /v1/transfer/check/money`
- **Flutterwave**: `GET /transfers/{id}`

**Updated File: `backend/src/index.ts`**
```typescript
// Every 5 minutes, poll for stuck transfers
setInterval(() => {
  pollProcessingPayouts().catch((error) => {
    logError("polling_interval.error", { message: error.message });
  });
}, 5 * 60 * 1000);
```

### Why This Matters
**Webhook Failure Scenario:**
1. Payment processor successfully sends ₦100,000
2. Webhook notification fails (network issue)
3. BitExpress thinks transfer is still "processing" forever
4. Polling detects: "Actually status is success" → updates to success
5. User knows payout succeeded even without webhook

---

## 4. **Manual Override Endpoint for Support** ✅

### What Was Fixed
- Added admin endpoints for support team to manually resolve stuck transfers
- Mark transfers as paid or failed with admin authentication
- Get transfer details for investigation

### Implementation Details
**New File: `backend/src/routes/admin.ts`**

Endpoints:
```
POST /api/admin/transfers/:id/mark-paid
POST /api/admin/transfers/:id/mark-failed  
GET /api/admin/transfers/:id
```

Authentication: `X-Admin-Key` header must match `ADMIN_SECRET_KEY` env variable

**Updated File: `backend/src/index.ts`**
```typescript
app.use("/api/admin", adminRouter);
```

### Why This Matters
**Support Use Case:**
1. Customer: "I claimed 24 hours ago but still haven't received money!"
2. Support checks database: `GET /api/admin/transfers/xyz123`
3. Sees: `payoutStatus: "processing"` with `mobileMoneyRef: "paystack_ref_123"`
4. Checks Paystack: "Actually was delivered!"
5. Calls: `POST /api/admin/transfers/xyz123/mark-paid`
6. Transfer updated to `success` → customer sees it resolved

Requires: Set `ADMIN_SECRET_KEY=your-secret-key` in `.env`

---

## 5. **Nigeria Support with Flutterwave** ✅

### What Was Fixed
- Unlocked Nigeria market (200+ million people, largest in Africa)
- Integrated Flutterwave for MTN, Airtel, Glo, 9Mobile money transfers
- Added liquidity checks for Flutterwave
- Configured proper operator mappings

### Implementation Details
**Updated File: `backend/src/config.ts`**
```typescript
NGA: {
  name: "Nigeria",
  currency: "NGN",
  supportsMobileMoneyPayout: true,
  mobileMoneyProvider: "flutterwave",
  mobileMoneyOperators: [
    { code: "MTN", label: "MTN Mobile Money", provider: "flutterwave" },
    { code: "AIRTEL", label: "Airtel Money", provider: "flutterwave" },
    { code: "GLO", label: "Glo Money", provider: "flutterwave" },
    { code: "9MOBILE", label: "9Mobile Money", provider: "flutterwave" },
  ],
}
```

**Added to `backend/src/services/payoutService.ts`**
- `processFlutterwaveMobileMoneyPayout()` - Initiate transfers via Flutterwave
- `checkFlutterwaveLiquidity()` - Verify Flutterwave balance

**Configuration Required:**
```env
FLUTTERWAVE_SECRET_KEY=your_secret_key
FLUTTERWAVE_BASE_URL=https://api.flutterwave.com/v3 # optional override
FLUTTERWAVE_WEBHOOK_SECRET=your_webhook_secret
```

### Why This Matters
Nigeria's population: 223 million (vs Ghana 35M, Kenya 54M, Senegal 17M combined)
- System now serves the largest single market in Africa
- 4 major telecom operators covered
- Full liquidity protection for Nigerian transfers

---

## 6. **Automatic Refund Flow** ✅

### What Was Fixed
- Automatic refunds when payouts fail permanently
- Automatic refunds for stuck transfers (24-hour timeout)
- Prevents user sBTC from being locked indefinitely
- Fallback for payment processor failures

### Implementation Details
**New File: `backend/src/services/refundService.ts`**

Key functions:
- `processRefund()` - Initiate refund for specific transfer
- `isEligibleForAutoRefund()` - Check if transfer qualifies
- `processFailedTransferRefunds()` - Batch process all eligible refunds

Eligibility criteria:
1. `payoutStatus === "failed"` (payment processor declined)
2. `status === "pending"` AND `createdAt < 24 hours ago` (stuck transfer)
3. NOT already claimed or refunded

**Updated File: `backend/src/routes/claim.ts`**
When payout fails due to liquidity:
```typescript
if (!payoutResult.success && payoutResult.payoutStatus === "failed") {
  await processRefund({
    transferId,
    senderWallet: transfer.sender,
    amount: transfer.amount,
    reason: payoutResult.message,
  });
}
```

**Updated File: `backend/src/index.ts`**
```typescript
// Every hour, process failed transfer refunds
setInterval(() => {
  processFailedTransferRefunds().catch((error) => {
    logError("refund_interval.error", { message: error.message });
  });
}, 60 * 60 * 1000);
```

### Why This Matters
**Before Refund System:**
1. User sends ₦100,000 of sBTC to friend
2. Friend claims on-chain (sBTC unlocked in their wallet)
3. Payout to mobile money fails (no liquidity)
4. Friend has sBTC but can't access it as promised cash
5. User can't do anything; support stuck

**With Refund System:**
1. User sends ₦100,000 of sBTC to friend
2. Friend claims on-chain (sBTC unlocked in their wallet)
3. Payout fails (no liquidity)
4. **Automatic refund triggered**, sBTC returned to original sender
5. Both users know what happened; can retry later

---

## Environment Variables Required

Add to `.env` file:

```bash
# Live FX Rate APIs (optional, will fallback to mock)
# CoinGecko (Bitcoin price) - free API, no key needed
# OpenExchangeRates (Currency conversion) - free tier available

# Paystack (Ghana, Kenya)
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_WEBHOOK_SECRET=sk_live_...

# CinetPay (Togo, Senegal)
CINETPAY_API_KEY=...
CINETPAY_TRANSFER_PASSWORD=...
CINETPAY_WEBHOOK_SECRET=...

# Flutterwave (Nigeria)
FLUTTERWAVE_SECRET_KEY=sk_live_...
FLUTTERWAVE_WEBHOOK_SECRET=...

# Admin operations
ADMIN_SECRET_KEY=your-secret-key      # For support team overrides
ADMIN_UID=admin-user-id                # For audit logging
```

---

## Database Schema Updates

New/Modified Transfer fields:
```typescript
Transfer {
  // ... existing fields ...
  
  // Payout tracking
  payoutProvider: "paystack" | "cinetpay" | "flutterwave" | "stacks"
  payoutStatus: "not_started" | "processing" | "success" | "failed"
  mobileMoneyRef: string               // Reference from payment processor
  
  // Refund tracking
  refundStacksTxId?: string            // On-chain refund transaction ID
  refundedAt?: string                  // When refund was initiated
}
```

---

## Testing the Improvements

### Test Live FX Rates
```bash
curl http://localhost:4000/api/exchange-rate/GHA
# Should show live BTC/GHS rate from CoinGecko
```

### Test Liquidity Check
```bash
# Claim with mocked liquidity failure
POST /api/claim
{
  "transferId": "test-123",
  "claimCode": "...",
  "claimStacksTxId": "..."
}
# Response: { payoutStatus: "failed", message: "Insufficient liquidity..." }
```

### Test Manual Override
```bash
curl -X POST http://localhost:4000/api/admin/transfers/test-123/mark-paid \
  -H "X-Admin-Key: $ADMIN_SECRET_KEY" \
  -H "Content-Type: application/json"
# Response: { success: true, transfer: { payoutStatus: "success" } }
```

### Test Polling
Check logs after 5 minutes:
```
{"event":"payout_polling.started",...}
{"event":"payout_polling.found_pending","count":2,...}
{"event":"payout_polling.status_updated","transferId":"...", "newStatus":"success"}
```

### Test Refund
Check logs after 60 minutes:
```
{"event":"auto_refund.started",...}
{"event":"auto_refund.found_candidates","count":1,...}
{"event":"auto_refund.completed","transferId":"..."}
```

---

## Before & After Comparison

| Issue | Before | After |
|-------|--------|-------|
| **Stale FX Rates** | Hardcoded $65k BTC | Live market rates (updates hourly) |
| **Liquidity Failures** | Fails mid-payout after on-chain lock | Checked before, auto-refund if fails |
| **Stuck Transfers** | Forever in "processing" | Polling checks every 5 min, auto-updates |
| **Support Resolution** | Manual DB access needed | Admin API endpoints |
| **Nigeria Support** | Not available | Full Flutterwave integration |
| **Failed Payouts** | User stuck with sBTC | Auto-refund within 60 minutes |

---

## Deployment Checklist

- [ ] Set `FLUTTERWAVE_SECRET_KEY` in production
- [ ] Set `ADMIN_SECRET_KEY` (use strong random key)
- [ ] Test with small amounts first
- [ ] Configure Flutterwave webhooks
- [ ] Monitor logs for polling/refund operations
- [ ] Document admin API for support team
- [ ] Notify users about Nigeria support launch

