# BitExpress Send Remittance - Bug Scan & Missing Features Report

## Executive Summary
Your send remittance is failing because of **critical missing SIP-010 token approval** and several other integration gaps. The system lacks proper sBTC token authorization before attempting transfers, plus missing mobile money operator validation and claim secret security.

---

## 🔴 CRITICAL BUGS (Blocking Transfers)

### 1. **Missing sBTC Token Approval Flow**
**Status**: BLOCKING - This is why send-remittance fails
**Location**: Frontend send flow
**Issue**: 
- You're attempting to transfer sBTC without first approving the contract to spend tokens
- SIP-010 tokens require an `approve` transaction before the contract can call `transfer`
- Frontend calls `send-remittance` directly without requesting allowance

**Impact**: Transaction fails with "err none" (insufficient allowance)

**Fix Required**:
```typescript
// Step 1: Request token approval (missing)
const approvalTx = await createSbtcApproveTx({
  contractAddress: CONTRACT_ADDRESS,
  contractName: CONTRACT_NAME,
  amountSatoshis: amountSBTC,
  sbtcTokenAddress: SBTC_TOKEN_ADDRESS,
});
await waitForStacksTxSuccess(approvalTx.txid);

// Step 2: Then call send-remittance (currently done first)
const sendTx = await createSendRemittanceTx({...});
```

**Components to Update**:
- `frontend/src/lib/stacks.ts` - Add `createSbtcApproveTx()` function
- `frontend/src/app/send/page.tsx` - Add approval step before send-remittance in `handleSubmit()`

### 2. **Incorrect Claim Code Handling**
**Status**: HIGH - May cause claim failures
**Location**: Frontend/Contract mismatch
**Issue**:
```clarity
;; Contract expects: claim-code (buff 32) -> hashes it internally
(define-public (send-remittance 
  ...
  (claim-code (buff 32))  ;; This gets hashed inside the contract
)
```
```typescript
// Frontend sends raw 32-byte secret
const claimSecretHex = generateClaimSecretHex(); // 32 random bytes
// Then passes directly to contract:
Cl.bufferFromHex(input.claimSecretHex) // Contract hashes this
```
- Contract does: `(hash-claim-code code)` = sha256(code)
- This is correct, but frontend doesn't recreate the same hash for verification

**Impact**: Receiver cannot claim with same secret

**Fix**: Ensure consistent hashing in claim flow

### 3. **Missing Receiver Wallet Validation**
**Status**: MEDIUM
**Location**: Backend send route
**Issue**: 
- No validation that receiver wallet address is valid or exists
- For "crypto_wallet" payout method, no check if receiver is ready
- No on-chain lookup to verify receiver's account

**Fix Required**:
```typescript
// In backend/src/routes/send.ts, add:
if (payoutMethod === "crypto_wallet") {
  // Verify receiver wallet exists on-chain
  const receiverAccount = await stacksApi.getAccount(receiverWallet);
  if (!receiverAccount) {
    return res.status(400).json({ 
      error: "Receiver wallet not found on Stacks" 
    });
  }
}

// Always validate Stacks address format
if (!isValidStacksAddress(receiverWallet)) {
  return res.status(400).json({ error: "Invalid Stacks wallet address" });
}
```

---

## 🟠 MAJOR MISSING FEATURES (Mobile Money Integration)

### 4. **No Mobile Money Operator Discovery**
**Status**: MEDIUM
**Location**: `backend/src/services/payoutService.ts`
**Issue**:
- Code tries to discover mobile money operators via Paystack/CinetPay banks list
- Fallback mechanism is weak - silently fails if bank discovery fails
- Operator codes may not match between config and provider APIs

**Missing Logic**:
```typescript
// Add robust operator code validation:
async function validateMobileMoneyOperator(
  countryCode: string,
  operatorCode: string,
  provider: PayoutProvider
): Promise<boolean> {
  const operator = getMobileMoneyOperator(countryCode, operatorCode);
  
  if (!operator) return false;
  
  // Verify operator is actually supported by provider
  if (operator.provider !== provider) {
    throw new Error(`Operator ${operatorCode} not supported by ${provider}`);
  }
  
  return true;
}

// In send.ts, add:
if (!await validateMobileMoneyOperator(destCountry, recipientMobileProvider, provider)) {
  return res.status(400).json({ 
    error: "Invalid operator for this provider" 
  });
}
```

### 5. **Flooz (Togo) Not Listed as Proper Operator**
**Status**: LOW-MEDIUM
**Location**: `backend/src/config.ts`
**Issue**:
- Flooz is mentioned in `mobileMoney` string but not properly configured in `mobileMoneyOperators`
- Config has `FLOOZTG` code which may not match CinetPay's actual codes

**Current Config (Incomplete)**:
```typescript
TGO: {
  mobileMoney: "TMoney, Flooz",  // ← Flooz mentioned here
  mobileMoneyOperators: [
    { code: "TMONEYTG", label: "TMoney", provider: "cinetpay" },
    { code: "FLOOZTG", label: "Flooz", provider: "cinetpay" },  // ← May not match CinetPay
  ],
},
```

**Fix Required**: Verify actual CinetPay operator codes for Flooz, MTN, Vodafone, Airtel across all countries

### 6. **Phone Number Normalization Incomplete**
**Status**: MEDIUM
**Location**: `backend/src/services/payoutService.ts`
**Issue**:
- Phone normalization doesn't handle all formats
- MTN numbers in some countries need different formatting
- Missing validation for leading zeros and country dial codes

**Example Problem**:
```typescript
// Current code handles some cases but may fail for:
"+233-024-123-4567"  // Hyphens not parsed
"+233 024 123 4567"  // Extra spaces in middle
"024-123-4567"       // No country code or +
```

**Fix Required**:
```typescript
function normalizePhoneNumber(countryCode: string, rawPhone: string): string {
  const country = SUPPORTED_COUNTRIES[countryCode];
  const digits = rawPhone.replace(/[\s\-().]/g, ""); // Remove all formatting
  
  // Handle +COUNTRYCODE format
  if (digits.startsWith(country.dialCode)) {
    const local = digits.slice(country.dialCode.length);
    return country.nationalPrefix + local;
  }
  
  // Handle 0-prefixed local format
  if (digits.startsWith("0")) {
    return digits;
  }
  
  // Default to 0-prefixed
  return "0" + digits;
}
```

---

## 🟡 SECURITY & DATA ISSUES

### 7. **Claim Secret Not Securely Conveyed to Recipient**
**Status**: MEDIUM
**Location**: Frontend + Backend
**Issue**:
- Frontend generates claim secret and stores in local state
- Secret is only shown in UI copy-paste (not secure)
- For mobile money payouts, secret is NOT sent to recipient securely
- Recipient must receive claim code out-of-band (SMS would be ideal) but implementation is missing

**Current Flow**:
```
1. Frontend generates claim secret (32 bytes hex)
2. Hashes it and sends to contract
3. User must manually copy/share the secret with recipient
4. No SMS/notification delivered to recipient with claim code
```

**Missing**: 
- SMS sent to recipient phone with claim code (partial claim code for safety)
- Secure delivery mechanism

**Fix Required**:
```typescript
// In backend/src/routes/send.ts, after creating transfer:
await sendNotification({
  to: recipientPhone,
  type: "sms",
  templateId: "claim_code_delivery",
  data: {
    claimCode: pendingClaimSecret.slice(0, 8).toUpperCase(),  // Only first 8 chars
    transferId: transfer.id,
    amount: transfer.netAmount,
    currency: destCurrencySymbol,
  },
});
```

### 8. **Claim Secret Stored Unencrypted in Frontend State**
**Status**: LOW
**Location**: `frontend/src/app/send/page.tsx`
**Issue**:
```typescript
const [pendingClaimSecret, setPendingClaimSecret] = useState<string | null>(null);
```
- Secret stored in plain React state (visible in memory/devtools)
- If frontend is vulnerable to XSS, secret is exposed
- Should be stored in secure browser storage

**Fix**: Use IndexedDB with encryption or session-only storage

---

## 🔵 INTEGRATION ISSUES

### 9. **No Stacks Account Balance Pre-Check**
**Status**: MEDIUM
**Location**: Frontend `apiGetSbtcBalance()`
**Issue**:
- Frontend checks balance client-side, but this can be stale
- Backend never re-verifies balance before processing
- User could sell sBTC after checking balance but before tx settles

**Fix Required**:
```typescript
// In backend send route:
const actualBalance = await stacksApi.getAccountAssets(senderWallet);
const sbtcBalance = actualBalance[SBTC_ASSET_IDENTIFIER]?.balance || 0;

if (sbtcBalance < sbtcAmount) {
  return res.status(400).json({ 
    error: "Insufficient sBTC balance. Please refresh your wallet." 
  });
}
```

### 10. **No Rate Locking Before Payout**
**Status**: MEDIUM
**Location**: `backend/src/services/fxService.ts` & payout service
**Issue**:
- Exchange rate fetched at transfer creation time
- But mobile money payout happens later (processing)
- Rate could change between transfer and actual payout

**Example Problem**:
```
Time 1:00 - Transfer created: $50 = 125,000 satoshis
           Rate: 1 BTC = $65,000
Time 1:05 - Payout processing: Rate now 1 BTC = $62,000
           User gets less in local currency for the same sBTC
```

**Fix Required**:
```typescript
// Lock rate for 24 hours from transfer creation
export interface Transfer {
  ...
  lockedBtcUsdRate: number;      // Locked at transfer time
  lockedLocalCurrencyRate: number;
  rateLockedAt: string;
  rateExpiresAt: string;
}

// Use locked rate in payout calculations
const actualLocalAmount = sbtcAmount / lockedBtcUsdRate * lockedLocalCurrencyRate;
```

### 11. **CinetPay Integration Incomplete**
**Status**: MEDIUM
**Location**: `backend/src/services/payoutService.ts`
**Issue**:
- CinetPay code exists but is not fully functional
- No handling of CinetPay webhook responses
- Missing CinetPay-specific error handling
- `recipientName` split logic may not work for all African naming conventions

**Missing**:
```typescript
// Add CinetPay implementation
async function processCinetpayMobileMoneyPayout(
  request: PayoutRequest,
  localAmount: number
): Promise<PayoutResult> {
  // Implementation stub exists but is incomplete
  // Needs:
  // 1. Actual API integration
  // 2. Webhook handling
  // 3. Status polling
}
```

### 12. **No Transaction Expiry Handling**
**Status**: MEDIUM
**Location**: Contract + Backend
**Issue**:
- Transfers locked for 144 blocks (~24 hours)
- But payout can happen at any time within window
- After 24 hours, sender can claim refund, but recipient still has the transfer

**Missing Logic**:
```typescript
// Job to auto-refund expired unclaimed transfers
async function refundExpiredTransfers() {
  const expiredTransfers = await db.query(
    "SELECT * FROM transfers WHERE status = 'pending' AND createdAt < NOW() - INTERVAL 24 HOURS"
  );
  
  for (const transfer of expiredTransfers) {
    await triggerRefund(transfer.id);
  }
}

// Schedule: runs every hour
scheduler.schedule("0 * * * *", () => refundExpiredTransfers());
```

---

## 🟢 NICE-TO-HAVE IMPROVEMENTS

### 13. **No Receipt/Confirmation System**
- Missing receipt generation for completed transfers
- No way to look up transfer history by phone number
- No export/download receipts

### 14. **No Rate Limiting on Sends**
- No per-user transfer limits
- No velocity checks (e.g., max $5K per day)
- Compliance/KYC not enforced

### 15. **Limited Error Messages to Users**
- Technical errors shown directly ("err none" is not user-friendly)
- No recovery instructions
- No error guides for mobile money failures

### 16. **No BitExpress-Specific Claim Code**
- Currently using random 32-byte hex
- Should use shorter, user-friendly code (e.g., "AE7F-B2K9-C5X1")
- Make it SMS-safe and memorable

---

## Priority Fix Order

```
PHASE 1 (CRITICAL - Do First):
  1. ✅ Implement sBTC token approval flow
  2. ✅ Verify claim secret handling with receiver
  3. ✅ Add receiver wallet validation
  4. ✅ Fix phone number normalization

PHASE 2 (HIGH - Do Next):
  5. ✅ Verify mobile money operator codes with providers
  6. ✅ Implement claim code delivery via SMS
  7. ✅ Add balance verification in backend
  8. ✅ Complete CinetPay integration

PHASE 3 (MEDIUM - Do Later):
  9. ✅ Implement rate locking
  10. ✅ Add transfer expiry handling
  11. ✅ Improve error messages
  12. ✅ Add receipt system
```

---

## Test Scenarios That Should Pass

After fixes, verify these work:

```
✓ Send $20 Ghana to Kenya (M-Pesa)
✓ Send $50 Togo to Senegal (Flooz)
✓ Phone numbers with mixed formatting (+233, 0-prefixed, etc)
✓ Claim transfer with correct claim secret
✓ Refund expired transfer
✓ Insufficient balance handling
✓ Invalid operator combinations
✓ Rate changes between transfer and payout
```

---

## Files Needing Updates

```
FRONTEND:
- frontend/src/lib/stacks.ts (add approval flow)
- frontend/src/app/send/page.tsx (call approval first)
- frontend/src/lib/api.ts (handle approval response)

BACKEND:
- backend/src/routes/send.ts (add receiver validation, balance check)
- backend/src/services/payoutService.ts (fix phone normalization, complete CinetPay)
- backend/src/services/notificationService.ts (claim code SMS)
- backend/src/services/fxService.ts (rate locking)
- backend/src/db.ts (add rate locking columns)

SMART CONTRACT:
- stacks-contracts/contracts/remittance.clar (already correct)
```

