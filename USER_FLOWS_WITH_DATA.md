# BitExpress User Flows & Data Examples

This document walks through complete real-world scenarios with actual data values.

---

## Scenario 1: Send ₿0.001 from Ghana to Kenya

### Setup
- **Sender:** Alice in Ghana (has Leather wallet with sBTC)
- **Receiver:** Bob in Kenya
- **Amount:** USD $50
- **Payout:** Mobile Money (M-Pesa)
- **BTC price:** $65,000

### Frontend: Send Page (alice-send-flow)

#### Step 1: Alice Fills Form
```
Amount: $50 USD
Source Country: Ghana
Destination Country: Kenya
Recipient Name: Bob Ochieng
Recipient Phone: +254 712 345678
Mobile Provider: M-Pesa
```

#### Step 2: Frontend Calculates Amounts
```
USD Amount: $50
BTC/USD Price: $65,000

sBTC Amount = $50 / $65,000 BTC = 0.000769 BTC
            = 76,923 satoshis

Fee (1%): 76,923 * 100 / 10,000 = 769 satoshis
Net Amount: 76,923 - 769 = 76,154 satoshis

To blockchain: 76,923 satoshis
```

#### Step 3: Generate Claim Secret
```
Claim Secret (32 random bytes):
  abcd1234567890abcdef1234567890abcdef1234567890abcd1234567890abcd

Claim Code Hash (sha256):
  xyz789abc...  (on-chain)
  
Display to user: abcd1234567890abcdef1234567890abcdef1234567890abcd1234567890abcd
```

#### Step 4: Sign & Broadcast Transaction
```
User clicks "Send" → Leather wallet popup appears

Wallet shows:
  "Contract: ST1PQHQV0RRM50ST3NXVESSTCCPA7PK7D51SR7Z31.remittance-v4"
  "Function: send-remittance"
  "Your sBTC will be sent to the contract"
  [Sign] [Cancel]

Alice clicks Sign →
  1. Private key signs transaction
  2. Signed tx broadcast to Stacks mempool
  3. Returns: txid = 0x1234567890ABCDEF...
  
Frontend polls with waitForStacksTxSuccess()
  Checks: tx_status === "success"
```

### Backend: Receives /api/send

#### Step 5: Backend Verifies On-Chain

```typescript
POST /api/send
Body: {
  receiverWallet: "SM...",  // Mobile money: deployer wallet
  amountUsd: 50,
  sourceCountry: "GHA",
  destCountry: "KEN",
  recipientPhone: "+254712345678",
  recipientName: "Bob Ochieng",
  recipientMobileProvider: "M-PESA",
  payoutMethod: "mobile_money",
  stacksTxId: "0x1234567890ABCDEF..."
}

// Backend queries: https://api.testnet.hiro.so/extended/v1/tx/0x1234...
// Verifies:
// - tx_status = "success"
// - sender_address = Alice's wallet
// - contract_call.function_name = "send-remittance"
// - sbtc event shows 76923 satoshis transferred
// - tx_result = "(ok u{transferId})"

// Extract onChainTransferId from result, e.g., 42
```

#### Step 6: Backend Creates Transfer Record

```typescript
const transfer: Transfer = {
  id: "uuid-1234-5678",
  sender: "ST1ALICE...",
  receiver: "SM1DEPLOYER...",  // Mobile money
  beneficiaryWallet: undefined,
  onChainTransferId: 42,
  
  amount: 76923,              // satoshis
  amountUsd: 50,
  fee: 769,                   // satoshis
  netAmount: 76154,           // satoshis
  
  currency: "sBTC",
  sourceCountry: "GHA",
  destCountry: "KEN",
  
  recipientPhone: "+254712345678",
  recipientName: "Bob Ochieng",
  recipientMobileProvider: "M-PESA",
  
  payoutMethod: "mobile_money",
  payoutProvider: undefined,
  payoutStatus: "not_started",
  
  claimCodeHash: "sha256(claim_secret)",
  stacksTxId: "0x1234567890ABCDEF...",
  
  status: "pending",
  createdAt: "2026-03-19T10:30:00Z",
  updatedAt: "2026-03-19T10:30:00Z",
  
  mobileMoneyRef: undefined,  // Will be filled on claim
};

// Save to database
await db.createTransfer(transfer);

// Send SMS to Bob
await sendNotification({
  phone: "+254712345678",
  message: `You have a ₿0.000769 remittance from Alice. Claim code: abcd1234567890abcdef1234567890abcdef1234567890abcd1234567890abcd`
});
```

#### Step 7: Response to Frontend

```typescript
{
  id: "uuid-1234-5678",
  status: "pending",
  amountUsd: 50,
  amount: 76923,
  fee: 769,
  netAmount: 76154,
  onChainTransferId: 42,
  claimCode: "abcd1234567890abcdef1234567890abcdef1234567890abcd1234567890abcd",
  expiresAt: "2026-03-20T10:30:00Z",  // 24 hours
  stacksTxId: "0x1234567890ABCDEF..."
}
```

---

## Scenario 2: Claim & Payout (Bob's Side)

### Bob Receives SMS
```
"You have a ₿0.000769 remittance from Alice. Claim code: abcd1234...abcd"
```

### Frontend: Receive Page (bob-claim-flow)

#### Step 1: Bob Enters Details
```
Transfer ID: uuid-1234-5678  (or just scans/pastes)
Claim Code: abcd1234...abcd
```

#### Step 2: Bob Signs On-Chain Claim
```
User clicks "Claim" → Leather wallet popup

Wallet shows:
  "Function: claim-remittance"
  "Transfer 76,154 satoshis to your wallet"
  [Sign] [Cancel]

Bob clicks Sign →
  1. Private key signs claim transaction
  2. Signed tx includes claim secret (pre-image)
  3. Returns: claimTxId = 0xABCDEF1234567890...
```

### Backend: Receives /api/claim

#### Step 3: Backend Verifies Claim On-Chain

```typescript
POST /api/claim
Body: {
  transferId: "uuid-1234-5678",
  claimCode: "abcd1234567890abcdef1234567890abcdef1234567890abcd1234567890abcd",
  claimStacksTxId: "0xABCDEF1234567890..."
}

// Backend queries: https://api.testnet.hiro.so/extended/v1/tx/0xABCDEF...
// Verifies:
// - tx_status = "success"
// - sender_address = Bob's wallet (matches transfer.receiver or deployer)
// - function_name = "claim-remittance"
// - Extracts claim-secret from tx args
// - Validates sha256(claim-secret) == stored hash ✓
// - sbtc events show:
//   - 76,154 satoshis transferred CONTRACT → Bob
//   - 769 satoshis transferred CONTRACT → Deployer
```

#### Step 4: Backend Converts Currency

```typescript
// Net amount for Bob to receive
netAmountUsd = 50 - (50 * 0.01) = $49.50

// Get exchange rate: USD → KES
const fxRate = getExchangeRate("USD", "KES");
// Returns: 1 USD = 132 KES

localAmount = 49.50 * 132 = 6534 KES
localCurrency = "KES";
```

#### Step 5: Backend Calls Paystack API

```typescript
// Step A: Create recipient
const recipient = await paystack.post("/transferrecipient", {
  type: "nuban",              // M-Pesa bank transfer (Kenya)
  account_number: "254712345678",  // Phone normalized
  bank_code: "MPESA",
  currency: "KES"
});
// Returns: recipient_code = "RCP_1234567890"

// Step B: Initiate transfer
const transfer = await paystack.post("/transfer", {
  source: "balance",
  reason: "Remittance from BitExpress",
  amount: 653400,              // in minor units (cents): 6534 * 100
  recipient_code: "RCP_1234567890",
  reference: "bitexpress_uuid_1234_5678"
});
// Returns: reference = "bitexpress_uuid_1234_5678"
//          status = "success" or "pending"
```

#### Step 6: Update Transfer Record

```typescript
await db.updateTransfer("uuid-1234-5678", {
  claimStacksTxId: "0xABCDEF1234567890...",
  payoutProvider: "paystack",
  payoutStatus: "processing",
  mobileMoneyRef: "bitexpress_uuid_1234_5678",
  status: "claimed",
  claimedAt: "2026-03-19T10:35:00Z",
  updatedAt: "2026-03-19T10:35:00Z"
});

// Send SMS to Alice
await sendNotification({
  phone: "+233501234567",  // Alice's number
  message: `Bob has claimed your ₿0.000769 remittance. Processing payout to their M-Pesa account. KES 6534 will arrive within 2 minutes.`
});
```

#### Step 7: Response to Frontend

```typescript
{
  id: "uuid-1234-5678",
  status: "claimed",
  claimStacksTxId: "0xABCDEF1234567890...",
  payoutStatus: "processing",
  mobileMoneyRef: "bitexpress_uuid_1234_5678",
  estimatedDelivery: "2026-03-19T10:37:00Z"
}
```

### Step 8: Webhook Callback (Minutes Later)

```
Paystack backend sends webhook:
  POST https://bitexpress.com/api/webhooks/paystack/transfer
  
  Body: {
    event: "transfer.success",
    data: {
      reference: "bitexpress_uuid_1234_5678",
      amount: 653400,
      recipient_code: "RCP_1234567890",
      status: "success"
    }
  }
  
  Header: x-paystack-signature: "hmac_sha512_hash"

Backend verifies signature:
  expected = hmacSha512(rawBody, PAYSTACK_WEBHOOK_SECRET)
  if (expected !== provided) reject;
  
Updates transfer:
  await db.updateTransfer("uuid-1234-5678", {
    payoutStatus: "success",
    updatedAt: now
  });
  
Sends final SMS to Bob:
  "₿0.000769 claim processed! KES 6534 delivered to M-Pesa."
```

---

## Scenario 3: Refund (Transfer Expires)

### Background
Charlie sent a remittance to David, but David never claimed it.
24 hours (144 blocks) have passed.

### Charlie Initiates Refund

```typescript
// Charlie's wallet calls:
await request("stx_callContract", {
  contract: "ST1...remittance-v4",
  functionName: "refund-remittance",
  functionArgs: [
    Cl.uint(42),  // onChainTransferId
  ]
});
// Returns: refundTxId = "0xREFUND123..."
```

### Smart Contract Executes Refund

```clarity
;; On-chain refund logic
(define-public (refund-remittance (transfer-id uint))
  (let (
    (transfer (unwrap! (map-get? transfers {transfer-id: transfer-id}) ERR-TRANSFER-NOT-FOUND))
  )
    ;; Assert sender
    (asserts! (is-eq tx-sender (get sender transfer)) ERR-NOT-SENDER)
    
    ;; Assert still pending
    (asserts! (is-eq (get status transfer) "pending") ERR-ALREADY-CLAIMED)
    
    ;; Assert expired (144 blocks passed)
    (asserts! (> block-height (+ (get created-at transfer) TRANSFER-TIMEOUT-BLOCKS))
              ERR-TRANSFER-NOT-EXPIRED)
    
    ;; Transfer FULL amount back to sender (no fee deducted!)
    (try! (contract-call? .sbtc-token-v3 transfer
      (get amount transfer)  // Full 76923 satoshis back
      (as-contract tx-sender)
      (get sender transfer)
      none))
    
    ;; Update status
    (map-set transfers {transfer-id: transfer-id}
      (merge transfer {
        status: "refunded",
        refunded-at: (some block-height)
      }))
    
    (ok)
  )
)
```

### Backend Processes Refund

```typescript
// Similar to claim verification
const verification = await verifyRefundRemittanceTx({
  txId: refundTxId,
  senderWallet: charliWallet,
  expectedOnChainTransferId: 42
});

await db.updateTransfer("uuid-charlie-david", {
  refundStacksTxId: refundTxId,
  status: "refunded",
  refundedAt: now.toISOString(),
  payoutStatus: "not_applicable",
  updatedAt: now
});

// Send SMS
await sendNotification({
  phone: charliPhone,
  message: "Refund processed! ₿0.000769 returned to your wallet."
});
```

---

## Scenario 4: Failed Payout Recovery

### Background
Paystack payout fails (e.g., recipient's M-Pesa account is full).
Backend receives webhook indicating failure.

```typescript
// Paystack webhook
{
  event: "transfer.failed",
  data: {
    reference: "bitexpress_uuid_1234_5678",
    reason: "TRANSFER_FAILED",
    status: "failed"
  }
}

// Backend updates
await db.updateTransfer("uuid-1234-5678", {
  payoutStatus: "failed",
  updatedAt: now
});

// Send SMS to Bob
"Payout to M-Pesa failed. Contact support or retry claim."
```

### Bob Retries

```typescript
// Bob calls /api/claim again with same transferId
// Backend checks idempotency key:
// - If same request: returns cached previous response
// - If new request (new idempotency key): re-attempts payout

// Paystack retry might succeed this time
// Transfer status: "claimed" → "success"
```

---

## Dashboard View: Transaction History

### Alice's Dashboard
```
Sent Transfers:
┌─────────────────────────────────────────────────────┐
│ To: Bob Ochieng (+254 712 345678)                  │
│ Amount: ₿0.000769 ($50)                            │
│ Date: 2026-03-19 10:30 AM                          │
│ Status: CLAIMED → PROCESSING                       │
│ Fee: ₿0.00000769 ($0.50)                           │
│ Type: Mobile Money (M-Pesa, Kenya)                 │
│ View Details → Copy Code → Resend SMS              │
└─────────────────────────────────────────────────────┘
```

### Bob's Dashboard
```
Received Transfers:
┌─────────────────────────────────────────────────────┐
│ From: Alice (Unknown)                               │
│ Amount: ₿0.000769 ($50 ≈ KES 6,534)               │
│ Date: 2026-03-19 10:35 AM                          │
│ Status: CLAIMED & DELIVERED                        │
│ Withdrawal Method: M-Pesa                          │
│ Reference: bitexpress_uuid_1234_5678               │
│ View Details → Contact Support                     │
└─────────────────────────────────────────────────────┘
```

---

## Turnkey Wallet Flow (Alternative to Leather)

### Step 1: Bob Uses Email Instead of Wallet Extension
```
Frontend detects no Leather extension
Shows: "Sign in with Email OTP or Passkey"

Bob enters email: bob@example.com
Turnkey sends OTP to email
Bob enters OTP
Backend creates sub-organization account in Turnkey
Turns embedded non-custodial wallet
Bob can now sign transactions
```

### Step 2: Bob Claims (Same As Before)
```
Same /api/claim request
Same blockchain actions
(Just different signing method)
```

---

## Error Scenarios

### Insufficient sBTC Balance

```typescript
// Frontend calls getSbtcBalance("ST1ALICE...")
// Returns: 0 satoshis (balance depleted)
// Frontend shows: "Insufficient sBTC balance. You have 0 sBTC."
// User cannot proceed without sending sBTC to their wallet first
```

### Invalid Claim Code

```typescript
// Bob enters wrong claim code
// Frontend signs claim transaction with wrong code
// Smart contract computes sha256(wrong_code)
// Compares to stored hash: MISMATCH
// Contract reverts: ERR-INVALID-CLAIM-CODE
// Transaction fails, no funds transferred
// Frontend error: "Invalid claim code. Please check the SMS again."
```

### Transfer Expired

```typescript
// Charlie tries to refund after only 2 hours passed
// Block height: 1000
// Created at: block 800
// Refund requires: current > 800 + 144 = 944
// Current (1000) > 944? Yes, OK
// Refund succeeds

// But if tried earlier, at block 900:
// 900 > 944? No, still within claim window
// Contract reverts: ERR-TRANSFER-NOT-EXPIRED
```

### Network Down

```typescript
// Frontend tries to broadcast send transaction
// Stacks network unreachable
// Browser error: "Cannot reach Stacks network"
// User can retry when network is back
// No partial state on blockchain
```

---

## Edge Cases

### Same Wallet Sends to Itself

```typescript
// Alice tries to send to her own wallet
// POST /api/send with
// {
//   receiverWallet: "ST1ALICE...",  // same as sender
//   ...
// }
// Backend validation: sender === receiver → reject
// Error: "Cannot send to your own wallet."
```

### Currency Conversion Precision Loss

```
Amount: $0.01
KES rate: 132 per USD
Calculated: 0.01 * 132 = 1.32 KES
Paystack expects: 132 minor units (1.32 KES)

But if $0.00001:
0.00001 * 132 = 0.00132 KES
Rounds to: 0 (too small!)
Backend rejects: "Below minimum amount for payout"
```

### Claim Without Transfer

```typescript
// Bob tries to claim non-existent transfer ID
// POST /api/claim { transferId: "nonexistent" }
// Backend query: db.getTransfer("nonexistent") → null
// Error 404: "Transfer not found"
```

---

