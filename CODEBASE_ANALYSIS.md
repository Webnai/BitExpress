# BitExpress Full-Stack Codebase Analysis

## Executive Summary

**BitExpress** is a Bitcoin-powered remittance platform that enables low-cost cross-border payments across Africa using the Stacks blockchain. It combines real Bitcoin (sBTC token) for escrow with fiat payment processors (Paystack, Cinetpay) for final settlement to mobile money wallets.

**Key Innovation:** Users send actual Bitcoin which sits in a smart contract escrow, then receivers claim it and receive settlement via local mobile money operators (~1% fees vs 7-10% for traditional services).

---

## 1. Project Structure & Purpose (End-to-End Flow)

### What It Does
1. **User A (Sender)** in Ghana → connects wallet → signs transaction → sends sBTC to contract
2. **Receiver B** (in Kenya/Togo/etc) → receives SMS with claim code → claims on-chain → receives local currency via mobile money
3. **Backend** validates everything, handles payment processor APIs, stores transaction state

### Supported Corridors
| Country | Currency | Provider | Status |
|---------|----------|----------|--------|
| Ghana | GHS | Paystack ✅ |
| Kenya | KES | Paystack ✅ |
| Togo | XOF | Cinetpay ✅ |
| Senegal | XOF | Cinetpay ✅ |
| Nigeria, Tanzania, Uganda | — | Coming soon |

### Architecture Overview
```
Frontend (Next.js)
    ↓ User initiates send
Backend API (Express)
    ↓ Validates, stores transfer
Smart Contract (Clarity)
    ↓ Escrows sBTC, generates transfer ID
Receiver Claims
    ↓ Backend converts USD→Local currency
Payment Processor (Paystack/Cinetpay)
    ↓ Webhook callback on completion
Mobile Money Operator (MTN, Vodafone, M-Pesa, etc)
    ↓ Final settlement
```

---

## 2. Frontend Architecture (Next.js 16 + React)

### Directory Structure
```
frontend/src/
├── app/                          # Next.js 13+ app router
│   ├── layout.tsx               # Root layout with providers
│   ├── page.tsx                 # Landing page
│   ├── send/page.tsx            # Send remittance UI
│   ├── receive/page.tsx         # Claim remittance UI
│   ├── dashboard/page.tsx       # User transaction history
│   ├── fund/page.tsx            # Wallet funding (stub)
│   ├── track/page.tsx           # Track transfers
│   └── settings/page.tsx        # User prefs (stub)
├── components/
│   ├── WalletProvider.tsx       # Wallet connection context (Leather + Turnkey)
│   ├── WalletRouteGuard.tsx     # Redirects unauthenticated users
│   ├── Navbar.tsx               # Top navigation
│   ├── Footer.tsx               # Footer
│   └── ui/                      # shadcn/ui components
├── lib/
│   ├── api.ts                   # HTTP client (abstracts auth, idempotency)
│   ├── firebaseAuth.ts          # Firebase custom token auth
│   ├── stacks.ts                # Stacks blockchain interactions
│   ├── turnkey.ts               # Turnkey SDK configuration
│   └── [other utilities]
└── types/
    └── index.ts                 # Global TypeScript types
```

### Wallet Integration (Leather + Turnkey)

#### A. Leather Wallet (External)
- Traditional browser extension wallet
- User controls private keys
- Uses Stacks Connect for contract interaction

#### B. Turnkey (Embedded)
- Non-custodial embedded wallet
- Users authenticate via email OTP or passkey
- Backend generates sub-organization accounts on-the-fly
- **Key Code:** [WalletProvider.tsx](frontend/src/components/WalletProvider.tsx#L1-L80)

```tsx
// From WalletProvider.tsx
const turnkeyProviderConfig: TurnkeyProviderConfig = {
  organizationId: turnkeyRuntimeConfig.organizationId,
  authProxyConfigId: turnkeyRuntimeConfig.authProxyConfigId,
  auth: {
    methods: {
      emailOtpAuthEnabled: true,
      passkeyAuthEnabled: true
    },
    createSuborgParams: {
      emailOtpAuth: {
        customWallet: {
          walletName: "BitExpress Embedded Wallet",
          walletAccounts: [
            "Bitcoin (testnet/mainnet P2WPKH)",
          ]
        }
      }
    }
  }
};
```

### Authentication Flow

```
Frontend Flow:
1. User clicks "Connect Wallet" → choose Leather or Turnkey
2. If Leather:
   a. Extension popup to approve connection
   b. Extract Stacks address from connected account
3. If Turnkey:
   a. Show email/passkey login UI
   b. Turnkey SDK creates suborg wallet
   c. Extract Bitcoin/Stacks address

Common path:
4. POST /api/auth/challenge {walletAddress}
   ← Returns: {nonce, message, expiresAt}
5. Sign message with wallet private key → get signature
6. POST /api/auth/verify {walletAddress, nonce, signature, publicKey}
   ← Returns: {customToken, walletAddress}
7. Use customToken to authenticate all API requests
8. Backend creates Firebase custom session
```

**Key Files:**
- [WalletProvider.tsx](frontend/src/components/WalletProvider.tsx) - Wallet connection & auth orchestration
- [firebaseAuth.ts](frontend/src/lib/firebaseAuth.ts) - Firebase custom token handling
- [api.ts](frontend/src/lib/api.ts#L1-L50) - API client with auth header injection

### User Flows

#### **Send Flow** ([send/page.tsx](frontend/src/app/send/page.tsx))
```
1. User selects:
   - Amount (USD or sBTC)
   - Source country
   - Destination country
   - Payout method (mobile_money or crypto_wallet)
   - Recipient phone (for mobile money)
   
2. Frontend validates:
   - sBTC balance check via Stacks API
   - Amount in $1-$10,000 range
   
3. Generate claim secret (32-byte random hex)
   - Backend never sees this; hashed on-chain only
   
4. Call smart contract: send-remittance()
   - Params: receiver, amountSatoshis, countries, claimSecretHash
   - Wallet signs transaction (Leather popup or Turnkey auth)
   
5. Backend stores transfer record:
   - status = "pending"
   - onChainTransferId from contract
   - SMS sent to recipient with claim code
   
6. Returns transfer object with copy-able claim code
```

#### **Claim Flow** ([receive/page.tsx](frontend/src/app/receive/page.tsx))
```
1. Recipient enters:
   - Transfer ID (from SMS or dashboard)
   - Claim code (from SMS)
   
2. Backend verifies:
   - Transfer exists and is still "pending"
   - On-chain claim not yet attempted
   
3. User signs on-chain claim transaction: claim-remittance()
   - Params: transferId, claimSecretHex (pre-image of hash)
   - Contract returns: sBTC to receiver + fee to deployer
   
4. Backend calls POST /api/claim:
   - {transferId, claimCode, claimStacksTxId}
   - Verifies on-chain claim succeeded
   - Converts net amount: USD → local currency
   - Calls Paystack/Cinetpay API immediately
   
5. Payout processing:
   - Provider returns reference number
   - Backend stores: payoutStatus="processing"
   - SMS confirmation sent to sender
   
6. Webhook eventually fires → payoutStatus="success"
```

#### **Dashboard** ([dashboard/page.tsx](frontend/src/app/dashboard/page.tsx))
- Displays sent transfers (by sender)
- Displays received transfers (by intended receiver)
- Shows sBTC balance
- Transaction history with timestamps

---

## 3. Backend Services (Express.js + TypeScript + Firebase)

### Server Architecture
```
Express App (src/index.ts)
├── Security middleware
│   ├── helmet() - HTTP security headers
│   ├── CORS - whitelist origins
│   ├── rate limiter - 100 req/15 min
│   └── body parser (10kb limit)
├── Routes
│   ├── GET /health
│   ├── POST /api/auth/challenge
│   ├── POST /api/auth/verify
│   ├── POST /api/auth/turnkey/verify
│   ├── POST /api/send
│   ├── POST /api/claim
│   ├── GET /api/transaction/:id
│   ├── GET /api/exchange-rate
│   ├── POST /api/webhooks/paystack/transfer
│   ├── POST /api/webhooks/cinetpay/transfer
│   └── [admin routes]
└── Background services
    ├── pollProcessingPayouts() - polls status
    └── processFailedTransferRefunds() - retry logic
```

### Core Routes & Services

#### **1. Authentication** (`routes/auth.ts`)

**Challenge endpoint:**
```typescript
POST /api/auth/challenge
Body: { walletAddress: string }
Returns: {
  walletAddress: string,
  nonce: string,            // JWT-encoded random bytes
  message: string,          // "Sign this to authenticate: {nonce}"
  expiresAt: string         // ISO timestamp (5 min TTL)
}
```

**Verify endpoint (Leather wallet):**
```typescript
POST /api/auth/verify
Body: {
  walletAddress: string,
  nonce: string,
  signature: string,        // signed(message, privateKey)
  publicKey: string
}
Returns: {
  customToken: string,      // Firebase custom JWT
  walletAddress: string
}
```

**Verify endpoint (Turnkey wallet):**
```typescript
POST /api/auth/turnkey/verify
Body: {
  walletAddress: string,
  nonce: string,
  publicKey: string,
  signature: {              // Turnkey raw signature (r, s, v)
    r: string,
    s: string,
    v?: string
  }
}
```

**Code Flow:** [services/authService.ts](backend/src/services/authService.ts#L1-L100)
```typescript
// Verify signature using public key
function verifyStacksSignature(message, signature, publicKey) {
  // Stacks uses secp256k1 curve
  return verifySignature(publicKey, message, signature);
}

// Mint Firebase custom token (backend-only)
async function verifyAuthChallengeAndMintToken(input) {
  1. Load challenge from DB
  2. Check not expired
  3. Verify signature with publicKey
  4. Extract Stacks address from publicKey
  5. Ensure embedded address matches walletAddress param
  6. Call Firebase admin SDK: createCustomToken()
  7. Return token
}
```

#### **2. Send Remittance** (`routes/send.ts`)

**Endpoint:**
```typescript
POST /api/send
Headers: { Authorization: "Bearer {customToken}", Idempotency-Key: "{uuid}" }
Body: {
  receiverWallet: string,        // contract receiver (or deployer for mobile money)
  amountUsd: number,
  sourceCountry: string,         // ISO 3-letter code: GHA, KEN, etc
  destCountry: string,
  recipientPhone?: string,       // for mobile_money payout
  recipientName?: string,
  recipientMobileProvider?: string,
  payoutMethod: "mobile_money" | "crypto_wallet",
  stacksTxId: string             // from on-chain send-remittance() call
}
Returns: {
  id: string,                    // Transfer ID
  status: "pending",
  amount: number,                // in satoshis
  amountUsd: number,
  fee: number,
  netAmount: number,
  stacksTxId: string,            // blockchain tx
  onChainTransferId: number,     // contract transfer ID
  claimCode: string,             // 32-byte hex (display to user)
  expiresAt: string,             // claim deadline
  ...
}
```

**Key Validations:**
1. **Wallet format:** Must be valid Stacks address (ST... or SM...)
2. **Balance check:** Query Stacks API for sBTC balance ≥ amount
3. **Pairs:** Only Ghana↔Kenya, Ghana↔Togo, Kenya↔Senegal, etc supported
4. **Amount:** $1.00 - $10,000 USD
5. **Fee:** 1% (100 basis points) on-chain
6. **Idempotency:** Requests with same idempotencyKey return cached response

**Code Flow:**
```typescript
// From send.ts
1. Validate sender wallet is authenticated (middleware)
2. Check idempotency key (dedupe identical requests)
3. Verify receiver wallet format
4. Query Stacks API: get sBTC balance
5. Validate amount, convert USD→satoshis via FX service
6. Verify on-chain send-remittance tx succeeded
7. Extract onChainTransferId from contract event
8. Store transfer in DB: status="pending"
9. Send SMS to recipient phone with claim code
10. Return transfer details + claim code
```

#### **3. Claim Remittance** (`routes/claim.ts`)

**Endpoint:**
```typescript
POST /api/claim
Headers: { Authorization: "Bearer {customToken}", Idempotency-Key: "{uuid}" }
Body: {
  transferId: string,
  claimCode: string,             // 32-byte hex from SMS
  claimStacksTxId: string        // from on-chain claim-remittance() call
}
Returns: {
  id: string,
  status: "claimed",
  claimStacksTxId: string,
  payoutStatus: "processing" | "success" | "failed",
  mobileMoneyRef: string,        // Paystack/Cinetpay reference
  ...
}
```

**Key Logic:**
```typescript
1. Fetch transfer from DB
2. Verify not already claimed/refunded
3. Verify sender (for crypto) or deployer (for mobile_money)
4. Verify claim code matches on-chain hash
5. Verify on-chain claim succeeded: claim-remittance() tx
6. Extract claimed amount from contract
7. Convert USD→local currency:
   - USD $50 → KES 6,600 (using FX rates)
8. Call payment processor:
   - Paystack: /transferrecipient + /transfer
   - Cinetpay: /v1/transfer/money/send/contact
9. Store payout reference, set payoutStatus="processing"
10. SMS sent to sender confirming receipt
    (actual payout via webhook later)
```

#### **4. Exchange Rate** (`routes/exchangeRate.ts`)

```typescript
GET /api/exchange-rate?from=USD&to=GHS
Returns: {
  from: "USD",
  to: "GHS",
  rate: 15.5,              // 1 USD = 15.5 GHS
  btcUsdPrice: 65000,      // Mock or live from CoinGecko
  updatedAt: "2026-03-19T10:30:00Z"
}
```

Uses [fxService.ts](backend/src/services/fxService.ts):
```typescript
// Mocked rates (not live by default)
USD_RATES: {
  GHS: 15.5,  // Ghana Cedis
  KES: 132,   // Kenyan Shilling
  XOF: 620,   // West African CFA (Togo, Senegal)
  NGN: 1600,  // Nigerian Naira
  TZS: 2600,  // Tanzanian Shilling
  UGX: 3800   // Ugandan Shilling
}

// Live fallback via CoinGecko + OpenER API
// If either fails, returns mock rates
async fetchLiveRateSnapshot() {
  BTC price: https://api.coingecko.com/api/v3/simple/price
  USD rates: https://open.er-api.com/v6/latest/USD
}
```

#### **5. Webhooks** (`routes/webhooks.ts`)

**Paystack Webhook:**
```typescript
POST /api/webhooks/paystack/transfer
Body: {
  event: "transfer.success" | "transfer.failed" | "transfer.reversed",
  data: {
    reference: string,         // matches transfer.mobileMoneyRef
    status: string,
    reason: string
  }
}
Signature: x-paystack-signature (HMAC-SHA512)
```

**Cinetpay Webhook:**
```typescript
POST /api/webhooks/cinetpay/transfer
Body: {
  client_transaction_id: string,
  transaction_id: string,
  treatment_status: "VAL" | "REJ" | "NEW"
  ...
}
Signature: x-cinetpay-signature (HMAC-SHA256)
```

**Processing:**
```typescript
1. Validate webhook signature (timing-safe comparison)
2. Extract reference from payload
3. Find transfer by mobileMoneyRef
4. Update payoutStatus: "processing" → "success"/"failed"
5. Log for reconciliation
```

### Data Models

**Transfer** (primary entity):
```typescript
interface Transfer {
  id: string;                    // UUID
  sender: string;                // Stacks wallet
  receiver: string;              // Stacks wallet (on-chain)
  beneficiaryWallet?: string;    // if mobile_money, actual recipient
  onChainTransferId?: number;    // from contract
  
  amount: number;                // satoshis (8 decimals)
  amountUsd: number;
  fee: number;                   // 1% charged on-chain
  netAmount: number;             // amount - fee
  
  currency: string;              // "sBTC"
  sourceCountry: string;         // "GHA", "KEN"
  destCountry: string;
  
  recipientPhone?: string;       // for mobile_money
  recipientName?: string;
  recipientMobileProvider?: string; // "MTN", "VODAFONE", "M-PESA"
  
  payoutMethod: "mobile_money" | "bank_transfer" | "crypto_wallet";
  payoutProvider?: "paystack" | "cinetpay" | "flutterwave" | "stacks";
  payoutStatus?: "not_started" | "processing" | "success" | "failed";
  
  claimCodeHash?: string;        // SHA256 of claim secret
  stacksTxId?: string;           // send-remittance() tx
  claimStacksTxId?: string;      // claim-remittance() tx
  refundStacksTxId?: string;     // refund-remittance() tx
  
  status: "pending" | "claimed" | "refunded" | "failed";
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  refundedAt?: string;
  
  mobileMoneyRef?: string;       // Paystack/Cinetpay reference
}
```

**User** (lightweight):
```typescript
interface User {
  id: string;
  walletAddress: string;         // Stacks address
  country: string;
  phoneNumber?: string;          // user's phone for notifications
  kycStatus: "none" | "pending" | "verified";
  createdAt: string;
}
```

**AuthChallenge** (ephemeral, 5 min TTL):
```typescript
interface AuthChallenge {
  walletAddress: string;
  nonce: string;                 // JWT-encoded random
  message: string;               // "Sign this: {nonce}"
  createdAt: string;
  createdAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  usedAt?: string;               // prevents reuse
}
```

### Database

Currently uses in-memory Maps (mock), but designed for Firebase Firestore:
```typescript
class Database {
  private transfers: Map<string, Transfer>;
  private users: Map<string, User>;
  private idempotency: Map<string, IdempotencyRecord>;
  private authChallenges: Map<string, AuthChallenge>;
  
  // CRUD operations for each entity
  createTransfer(transfer) → Transfer
  getTransfer(id) → Transfer | undefined
  updateTransfer(id, updates) → Transfer | null
  getTransfersBySender(sender) → Transfer[]
  ...
}
```

---

## 4. Smart Contracts (Clarity)

### Contract Overview

**File:** [stacks-contracts/contracts/remittance-v4.clar](stacks-contracts/contracts/remittance-v4.clar)

**Purpose:**
- Escrow sBTC tokens for remittances
- Track transfer state and history
- Validate claim codes (secret >= hash pre-image)
- Handle refunds for unclaimed transfers
- Maintain reputation scores

**Key Constants:**
```clarity
FEE-BASIS-POINTS: u100        ;; 1% fee (100/10000)
MIN-TRANSFER-AMOUNT: u1000    ;; ~$0.65 satoshis
MAX-TRANSFER-AMOUNT: u200000000  ;; ~2 BTC (~$130K)
TRANSFER-TIMEOUT-BLOCKS: u144 ;; ~24 hours at Stacks block time
```

### Data Structures

**transfers map (main state):**
```clarity
(define-map transfers
  { transfer-id: uint }
  {
    sender: principal,
    receiver: principal,
    amount: uint,
    fee: uint,
    net-amount: uint,
    source-country: (string-ascii 3),
    dest-country: (string-ascii 3),
    claim-code-hash: (buff 32),
    status: (string-ascii 10),    ;; "pending", "claimed", "refunded"
    created-at: uint,             ;; block height
    claimed-at: (optional uint),
    refunded-at: (optional uint)
  }
)
```

**sender/receiver index maps:**
```clarity
(define-map sender-transfers
  { sender: principal }
  { transfer-ids: (list 20 uint) }  ;; max 20 transfers per user
)

(define-map receiver-transfers
  { receiver: principal }
  { transfer-ids: (list 20 uint) }
)
```

**reputation map (on-chain analytics):**
```clarity
(define-map reputation
  { user: principal }
  {
    successful-transfers: uint,
    failed-transfers: uint,
    total-sent: uint,
    total-received: uint
  }
)
```

### Public Functions

#### **send-remittance()**
```clarity
(define-public (send-remittance
    (receiver principal)
    (amount uint)
    (source-country (string-ascii 3))
    (dest-country (string-ascii 3))
    (claim-code (buff 32))
  )
  (ok transfer-id)
)
```

**What it does:**
1. Calculate fee: `fee = amount * 100 / 10000` (1%)
2. Calculate net: `net-amount = amount - fee`
3. Generate unique transfer-id (incrementing nonce)
4. Hash claim-code into claim-code-hash (SHA256)
5. Call `.sbtc-token-v3.transfer()`:
   - From: sender (tx-sender)
   - To: contract (as-contract)
   - Amount: total amount (fee + net)
6. Store transfer record: status="pending"
7. Update sender/receiver indexes
8. Update reputation (mark successful)
9. Return: `(ok transfer-id)`

**Example Flow:**
```
Sender: ST1234... requests send 100,000 satoshis to ST5678...
Fee computed: 100,000 * 100 / 10,000 = 1,000 satoshis
Net amount: 100,000 - 1,000 = 99,000 satoshis

On-chain:
- 100,000 satoshis transferred from sender to contract
- Contract mints transfer record with ID (e.g., 42)
- Claim code hash stored (sha256("secrethex..."))
- Status: "pending", awaiting claim
```

#### **claim-remittance()**
```clarity
(define-public (claim-remittance
    (transfer-id uint)
    (claim-secret (buff 32))
  )
  (ok)
)
```

**What it does:**
1. Fetch transfer record by ID
2. Assert status is "pending"
3. Assert tx-sender == receiver
4. Hash claim-secret, compare to stored hash
5. Verify transfer not expired (within 144 blocks)
6. Update status → "claimed"
7. Transfer net amount to receiver:
   - `transfer net-amount to receiver`
8. Transfer fee to contract owner (deployer)
9. Update reputation (mark received)
10. Return: `(ok)`

**Security:**
- **Claim code revealed only after claim:** Prevents replay attacks
- **Receiver-only claim:** Only the receiver can claim (verified tx-sender)
- **Hash verification:** On-chain validates hash matches pre-image
- **Timeout fallback:** After 144 blocks, sender can refund

#### **refund-remittance()**
```clarity
(define-public (refund-remittance (transfer-id uint))
  (ok)
)
```

**When available:**
- Transfer status = "pending"
- Current block height > created-at + 144 blocks (24 hr+ passed)

**What it does:**
1. Fetch transfer, assert status "pending"
2. Assert tx-sender == sender
3. Assert expired: block-height > created-at + 144
4. Update status → "refunded"
5. Transfer full amount back to sender
6. Return: `(ok)`

### Integration with Backend

The backend verifies all on-chain state:

1. **After send-remittance():**
   ```typescript
   // From stacksVerificationService.ts
   await verifySendRemittanceTx({
     txId: stacksTxId,
     senderWallet,
     expectedAmount: amountSatoshis
   });
   // Returns onChainTransferId extracted from contract event
   ```

2. **After claim-remittance():**
   ```typescript
   const verification = await verifyClaimRemittanceTx({
     txId: claimStacksTxId,
     receiverWallet: claimerWallet,
     expectedOnChainTransferId: transfer.onChainTransferId,
     expectedClaimSecretHex: claimCode
   });
   // Asserts claim succeeded on-chain before processing payout
   ```

3. **Webhook verification:**
   - If claim verifies, immediately call Paystack/Cinetpay API
   - On webhook return, update transfer status

---

## 5. Blockchain Interactions (Stacks + sBTC)

### Stacks Network

**Testnet:** https://api.testnet.hiro.so
**Mainnet:** https://api.hiro.so

Environment variables:
```typescript
STACKS_NETWORK: "testnet" | "mainnet"
STACKS_API_URL: (default from above)
CONTRACT_ADDRESS: string      // Deployer principal
CONTRACT_NAME: string         // "remittance-v4"
```

### sBTC Token (SIP-010)

**What is sBTC?**
- Bitcoin wrapped on Stacks blockchain
- 1:1 peg to real Bitcoin
- Users have actual Bitcoin locked, not a proxy token
- Can be unwrapped back to mainnet Bitcoin (via settlement layer)

**Asset Identifier (testnet):**
```
${CONTRACT_ADDRESS}.sbtc-token-v3::sbtc
```

Example: `ST1PQHQV0RRM50ST3NXVESSTCCPA7PK7D51SR7Z31.sbtc-token-v3::sbtc`

**How it's used in BitExpress:**
```
User sends sBTC → locked in contract escrow
                 ↓
Receiver claims → net-amount withdrawn to receiver wallet
                ↓
Fee (1%) → sent to deployer/operator
```

### Transaction Types

#### **1. Send Transaction** (Frontend-initiated)
```typescript
// From frontend/src/lib/stacks.ts
await request("stx_callContract", {
  contract: "ST1...remittance-v4",
  functionName: "send-remittance",
  functionArgs: [
    Cl.principal(receiverWallet),           // "ST5678..."
    Cl.uint(amountSatoshis),                // 100000
    Cl.stringAscii(sourceCountry),          // "GHA"
    Cl.stringAscii(destCountry),            // "KEN"
    Cl.bufferFromHex(claimSecretHex),       // 32 bytes
  ],
  postConditionMode: "allow",
});
```

**Post-conditions:**
- Sender's sBTC balance decreases by amount
- Contract's sBTC balance increases by amount
- No other assets affected

#### **2. Claim Transaction** (Frontend-initiated)
```typescript
await request("stx_callContract", {
  contract: "ST1...remittance-v4",
  functionName: "claim-remittance",
  functionArgs: [
    Cl.uint(transferId),                    // 42
    Cl.bufferFromHex(claimSecretHex),       // pre-image of hash
  ],
  postConditionMode: "allow",
});
```

**Post-conditions:**
- Receiver's sBTC balance increases by net-amount
- Deployer's sBTC balance increases by fee
- Contract's sBTC balance decreases by amount

#### **3. Verification (Backend)**

**verify on-chain send:**
```typescript
// Call Stacks API to fetch transaction details
GET https://api.testnet.hiro.so/extended/v1/tx/{txId}
Response: {
  tx_status: "success",
  tx_type: "contract_call",
  sender_address: "ST1234...",
  contract_call: {
    contract_id: "ST1...remittance-v4",
    function_name: "send-remittance",
    function_args: [...]
  },
  events: [
    {
      event_type: "fungible_token_transfer",
      asset_identifier: "ST1...sbtc-token-v3::sbtc",
      sender: "ST1234...",
      recipient: "ST1...",  // contract principal
      amount: "100000"
    }
  ],
  tx_result: {
    repr: "(ok u42)"  // transfer-id
  }
}
```

**Extracted data:**
```typescript
const transferId = parseInt(txResult.repr.match(/\d+/)[0]); // 42
```

---

## 6. Authentication & Security

### Challenge-Response Protocol

```
Step 1: Create Challenge
GET /api/auth/challenge
Body: { walletAddress: "ST1234..." }
↓
Response: {
  walletAddress: "ST1234...",
  nonce: "eyJhbGciOiJIUzI1NiIs...",  // JWT-encoded random
  message: "Sign this: {nonce}",
  expiresAt: "2026-03-19T10:35:00Z"
}

Step 2: Sign Challenge (in wallet)
user clicks "Sign" in wallet popup
privateKey signs the message
↓ Returns signature + publicKey

Step 3: Verify Signature & Mint Token
POST /api/auth/verify
Body: {
  walletAddress: "ST1234...",
  nonce: "{nonce}",
  signature: "304502200abc...",  // DER-encoded secp256k1 sig
  publicKey: "02def..."           // compressed public key
}
↓
Backend verifies signature using publicKey
Extracts Stacks address from publicKey
Creates Firebase custom token
↓
Response: {
  customToken: "eyJhbGciOiJSUzI1NiIs...",
  walletAddress: "ST1234..."
}

Step 4: Sign In to Firebase (Frontend)
await signInWithFirebaseCustomToken(customToken)
↓ Firebase verifies token (signed by backend)
User session established

Step 5: Make Authenticated Requests
GET /api/send
Headers: {
  Authorization: "Bearer {firebaseIdToken}",
  Idempotency-Key: "{uuid}"
}
↓ Backend middleware extracts decoded uid and walletAddress
```

**Code:** [services/authService.ts](backend/src/services/authService.ts)

### Key Security Mechanisms

1. **Challenge Expiry (5 minutes)**
   ```typescript
   const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
   ```
   Prevents replay attacks from old captures

2. **Signature Verification**
   - Uses Stacks standard: secp256k1 (same as Bitcoin)
   - Verifies signature matches message + public key
   - Ensures message was signed by wallet owner

3. **Public Key → Address Derivation**
   ```typescript
   // Extract Stacks address from compressed public key
   const address = getAddressFromPublicKey(publicKey, TransactionVersion.Testnet);
   ```

4. **Firebase Custom Tokens**
   - Backend signs with admin private key
   - Frontend receives token (unreadable to user)
   - Firebase verifies signature server-side
   - Contains uid claim tied to wallet address

5. **Idempotency Keys**
   - Prevents duplicate sends/claims
   - Cached response returned if identical request re-sent
   ```typescript
   // Example: same request sent twice in quick succession
   // First: returns {id: "123", status: "pending"}
   // Second: returns same exact response (no new transfer created)
   ```

6. **Turnkey-Specific Security**
   - Users authenticate locally (email OTP or passkey)
   - Private keys never leave device
   - Turnkey backend generates sub-organization on verified auth
   - Backend can authorize wallet creation without knowing private key

### Leather Wallet Integration

```typescript
// From firebaseAuth.ts
// User has Leather extension installed + connected
// Extension auto-signs transactions shown to user

// Authentication:
1. Message shown to user
2. User clicks "Sign" in Leather popup
3. Leather signs with wallet's private key (user controls this)
4. Signature returned to frontend
5. Backend verifies using public key from extension

// Transaction signing:
1. User sees transaction details in Leather popup
2. User clicks "Confirm"
3. Leather signs and broadcasts to blockchain
4. Frontend polls for transaction confirmation
```

### Turnkey Wallet Integration

```typescript
// From WalletProvider.tsx
// Turnkey is an embedded non-custodial wallet service

// Initial setup:
const turnkeyRuntimeConfig = {
  organizationId: "...",
  authProxyConfigId: "..."
};

// User registration:
1. User enters email OTP or uses passkey
2. Turnkey SDK creates sub-organization account
3. Generates non-custodial wallet with keys encrypted in Turnkey backend
4. User can later export private key (24-word seed phrase)

// Authentication:
// Same challenge-response, but signature algorithm varies:
- Bitcoin: secp256k1 (same as Stacks)
- Solana: Ed25519
- Ethereum: secp256k1
```

---

## 7. Payment Processor Integrations

### Paystack (Ghana, Kenya)

**Supported countries:** Ghana (GHS), Kenya (KES)
**Mobile operators:** MTN, Vodafone, M-Pesa

**Integration Flow:**
```
1. Recipient claims on-chain
2. Backend calls Paystack API:
   a) Create transfer recipient:
      POST /bank
      Params: type, account_number, bank_code, currency
      ↓ Returns: recipient_code
   
   b) Initiate transfer:
      POST /transfer
      Params: source, amount, recipient_code, reference
      ↓ Returns: transfer_code, reference
   
   c) (Optional) Verify transfer:
      GET /transfer/verify/{reference}
      ↓ Returns: status
3. Backend stores: mobileMoneyRef = reference
4. Webhook fires: x-paystack-signature (HMAC-SHA512)
   Event: transfer.success | transfer.failed
5. Backend updates transfer: payoutStatus="success"/"failed"
```

**Webhook Validation:**
```typescript
// Compute expected signature
const expected = hmacSha512(rawBody, PAYSTACK_WEBHOOK_SECRET);

// Timing-safe comparison (prevents timing attacks)
if (!timingSafeEqual(expected, provided)) {
  reject("Invalid signature");
}
```

### Cinetpay (Togo, Senegal)

**Supported countries:** Togo (XOF), Senegal (XOF)
**Mobile operators:** TMoney, Flooz, Orange Money, Free Money, Wave

**Integration Flow:**
```
1. Backend authenticates to Cinetpay:
   POST /v1/auth/login
   Params: apiKey, password
   ↓ Returns: accessToken
2. Create transfer contact (recipient):
   POST /v1/transfer/contact
   Params: accessToken, phoneNumber, firstName, surname
   ↓ Returns: contact_id
3. Send money:
   POST /v1/transfer/money/send/contact
   Params: amount, contact_id, description, reference, accessToken
   ↓ Returns: transaction_id
4. Webhook fires:
   POST /api/webhooks/cinetpay/transfer
   Signature: x-cinetpay-signature (HMAC-SHA256)
   Body: client_transaction_id, treatment_status (VAL/REJ/NEW)
5. Backend updates transfer
```

### Multi-Provider Flow

**From [payoutService.ts](backend/src/services/payoutService.ts):**

```typescript
export async function processPayout(request: PayoutRequest): Promise<PayoutResult> {
  const operator = getMobileMoneyOperator(countryCode, mobileProvider);
  
  const payoutProvider = operator.provider; // "paystack" or "cinetpay"
  
  if (payoutProvider === "paystack") {
    return await processPaystackPayout({
      countryCode,
      recipientPhone,
      recipientName,
      amountUsd,
      mobileProvider
    });
  } else if (payoutProvider === "cinetpay") {
    return await processCinetpayPayout({
      countryCode,
      recipientPhone,
      recipientName,
      amountUsd
    });
  }
}

// Returns
{
  success: boolean,
  reference: string,                // Store as mobileMoneyRef
  message: string,
  localAmount: number,              // KES 6600, GHS 775, XOF 31000, etc
  localCurrency: string,            // "KES", "GHS", "XOF"
  estimatedDelivery: string,        // "2 minutes"
  provider: "paystack" | "cinetpay",
  payoutStatus: "processing" | "success" | "failed"
}
```

---

## 8. Key Integrations Summary

### Frontend Libraries
- **@stacks/connect** - Wallet interaction (Leather, Stacks Connect)
- **@turnkey/react-wallet-kit** - Embedded wallet UI/SDK
- **@stacks/transactions** - Transaction building (Cl. helpers)
- **firebase/auth** - Custom token sign-in
- **next.js 16** - Framework
- **shadcn/ui** - Component library
- **tailwindcss** - Styling

### Backend Libraries
- **express** - HTTP server
- **firebase-admin** - Backend auth + Firestore (optional)
- **axios** - HTTP client for APIs (Stacks, Paystack, Cinetpay)
- **crypto** - Signature verification, HMAC
- **bitcoinjs-lib** - Bitcoin address validation (Turnkey)
- **@noble/curves** - secp256k1, ed25519 signature verification

### External APIs
- **Stacks API** (https://api.testnet.hiro.so) - Transaction lookup, balance query
- **Paystack API** - Mobile money payouts (Ghana, Kenya)
- **Cinetpay API** - Mobile money payouts (Togo, Senegal)
- **CoinGecko API** - BTC/USD exchange rate (fallback)
- **OpenER API** - Currency exchange rates (fallback)

---

## 9. Data Flow Diagrams

### Send Flow Sequence
```
Frontend                 Backend              Stacks Contract
   │                        │                      │
   ├─ Generate claim secret │                      │
   │  (random 32 bytes)     │                      │
   │                        │                      │
   ├─ Hash claim secret     │                      │
   │  (SHA256)              │                      │
   │                        │                      │
   ├─ Call send-remittance()─── tx signed by ─────────→ Contract escrows sBTC
   │  with claimSecretHash      wallet            Fee+Net transferred
   │                        │                      │
   │ ← txId ────────────────│                      │
   │                        │                      │
   ├─ POST /api/send ─────→ Verify tx on-chain────→ Fetch tx details
   │   {txId, ...}         (stacksVerificationService) Extract transfer_id
   │                    ←── {ok, onChainTransferId} ──
   │                        │
   │                        ├─ Store transfer in DB
   │                        ├─ Send SMS to recipient
   │                        │  "Claim code: abcd...1234"
   │                        │
   │ ← {id, status, ...} ←─ │
   │   claimCode ready      │
```

### Claim Flow Sequence
```
Frontend                 Backend              Stacks Contract
   │                        │                      │
   ├─ Call claim-remittance()── tx signed ────────────→ Verify claim code
   │  {claimSecretHex}        by wallet           Transfer net→receiver
   │                        │                      Fee→deployer
   │                        │                      Status="claimed"
   │ ← txId ────────────────│                      │
   │                        │                      │
   ├─ POST /api/claim ──→  Verify tx on-chain────→ Fetch tx details
   │   {txId, claimCode}   (stacksVerificationService)
   │               ←─ {ok} ──
   │                        │
   │                        ├─ Convert: USD→LocalCurrency
   │                        │
   │                        ├─ Call Paystack/Cinetpay API
   │                        │  POST /transfer
   │                        ↓ (or /v1/transfer/money/send/contact)
   │                    [Payment Processor]
   │                        │
   │                        ├─ Store payout reference
   │                        ├─ Set payoutStatus="processing"
   │                        ├─ Send SMS to sender:
   │                        │  "Recipient clained sBTC"
   │                        │
   │ ← {id, status, ...} ←─ │
   │   payoutStatus=proc    │
   │
   ─── Webhook eventually fires ──→
                                     Update payoutStatus="success"
```

---

## 10. Testing & E2E

### Test Files
- `backend/src/__tests__/api.test.ts` - API endpoint tests
- `backend/src/__tests__/stacksVerificationService.test.ts` - Contract verification tests
- `frontend/e2e/` - Playwright end-to-end tests (landing, send-flow, route-guard)

### Mock Data
- E2E mode: `getE2EMockTxId()` allows faking Stacks transactions for testing
- Fallback FX rates: All APIs fallback to mocked rates if live APIs unreachable
- Firebase offline: Can configure to skip auth in test mode

---

## 11. Configuration & Environment Variables

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_STACKS_NETWORK=testnet
NEXT_PUBLIC_STACKS_API_URL=https://api.testnet.hiro.so
NEXT_PUBLIC_CONTRACT_ADDRESS=ST1...
NEXT_PUBLIC_CONTRACT_NAME=remittance-v4
NEXT_PUBLIC_SBTC_ASSET_IDENTIFIER=ST1...sbtc-token-v3::sbtc
NEXT_PUBLIC_SBTC_ADDRESS=ST1...sbtc-token-v3

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...

# Turnkey
NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID=...
NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID=...
```

### Backend (.env)
```bash
NODE_ENV=development
PORT=4000
STACKS_NETWORK=testnet
STACKS_API_URL=https://api.testnet.hiro.so
CONTRACT_ADDRESS=ST1...
CONTRACT_NAME=remittance-v4
SBTC_ASSET_IDENTIFIER=ST1...sbtc-token-v3::sbtc
DEPLOYER_WALLET=ST1...  # Operator wallet (payout receiver)

# Firebase Admin
GOOGLE_APPLICATION_CREDENTIALS=./bitexpress-57ee1-firebase-adminsdk-fbsvc-1f9041f004.json

# Payment Processors
PAYSTACK_SECRET_KEY=...
PAYSTACK_WEBHOOK_SECRET=...
CINETPAY_API_KEY=...
CINETPAY_TRANSFER_PASSWORD=...
CINETPAY_WEBHOOK_SECRET=...

# FX (optional override)
BTC_USD_PRICE=65000

# CORS
CORS_ORIGINS=http://localhost:3000,https://bitexpress.vercel.app
```

---

## 12. Known Gaps & Future Improvements

From [payout-flow-analysis.md](repo/payout-flow-analysis.md):

1. **No sBTC ↔ Fiat Bridge**
   - Conversion happens only via Paystack/Cinetpay APIs
   - No direct sBTC-to-fiat settlement layer
   - Depends entirely on processor liquidity

2. **Bank Transfer Stubbed**
   - Currently returns error "disabled until live bank rail integrated"
   - Would require separate bank integration (SWIFT, ACH, etc)

3. **FX Rates Mocked**
   - Not using live feeds by default
   - Falls back to hardcoded rates if live APIs unreachable
   - Should implement persistent rate feed (Chainlink?)

4. **No Dispute/Reconciliation**
   - One-way payout, no reversal handling
   - No chargeback mechanism

5. **Liquidity Management Gap**
   - Backend doesn't check operator wallet balance before payout
   - Assumes Paystack/Cinetpay always have funds

6. **Transfer Limits Hardcoded**
   - Min $1, Max $10,000 USD
   - No per-user or per-country custom limits

---

## Summary: Architecture at a Glance

```
┌─────────────────────────────────────────┐
│   Frontend (Next.js)                    │
│  ┌─────────────────────────────────┐   │
│  │ Leather Wallet  │ Turnkey Wallet│   │
│  └────────────┬────────────────┬───┘   │
│               │                │        │
│       ┌───────┴────────────────┴──┐    │
│       │  Challenge-Response Auth  │    │
│       │  (Sign message w/ wallet) │    │
│       └───────────┬────────────────┘   │
│                   │                    │
│    ┌──────────────┼──────────────┐    │
│    │              │              │    │
│  Send Flow    Claim Flow    Dashboard │
│  (front-end)  (front-end)           │
└────┬───────────┬──────────────────┬──┘
     │           │                 │
     ▼           ▼                 ▼
┌─────────────────────────────────────────┐
│  Backend API (Express.js)               │
│ ┌────────────────────────────────────┐ │
│ │ /api/send         POST             │ │
│ │ /api/claim        POST             │ │
│ │ /api/transaction  GET              │ │
│ │ /api/auth/*       POST             │ │
│ │ /api/webhooks/*   POST             │ │
│ └────────────────────────────────────┘ │
│                                        │
│ ┌─ Services ──────────────────────┐   │
│ │ stacksVerificationService       │   │
│ │ payoutService (Paystack/Cinetpay) │
│ │ fxService (USD→Local)           │   │
│ │ authService (Firebase mint)     │   │
│ └────────────────────────────────┘   │
└────┬────────────────┬──────────────┬──┘
     │                │              │
     ▼                ▼              ▼
 Stacks API    Firebase Admin   Payment APIs
 (verify tx)   (auth tokens)    (Paystack, Cinetpay)
     │                │              │
     ▼                │              ▼
┌─────────────────┐  │      ┌──────────────┐
│ Smart Contract  │  │      │ Mobile Money │
│ (Clarity)       │  │      │ Operators    │
│ Escrows sBTC    │  │      │              │
│ Tracks state    │  │      │ MTN, Vodafone│
│ Handles claims  │  │      │ M-Pesa, etc  │
└─────────────────┘  │      └──────────────┘
                     │
              ┌──────▼──────┐
              │  Firebase   │
              │  Auth +     │
              │  Firestore  │
              └─────────────┘
```

---

## Quick Reference: All API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/challenge | No | Get challenge nonce |
| POST | /api/auth/verify | No | Verify signature → Firebase token |
| POST | /api/auth/turnkey/verify | No | Verify Turnkey signature → Firebase token |
| POST | /api/send | Yes | Initiate remittance send |
| POST | /api/claim | Yes | Claim remittance, trigger payout |
| GET | /api/transaction/:id | Yes | Fetch transfer details |
| GET | /api/exchange-rate | No | Get USD→Local FX rate |
| POST | /api/webhooks/paystack/transfer | No* | Paystack payout status callback |
| POST | /api/webhooks/cinetpay/transfer | No* | Cinetpay payout status callback |

`*` - No Firebase auth required; signature verification via HMAC instead

---

## Conclusion

BitExpress is a sophisticated full-stack blockchain application combining:
- **Frontend:** React/Next.js with Leather + Turnkey wallet support
- **Backend:** Express.js with Stacks/Firebase verification + payment processor integrations
- **Blockchain:** Clarity smart contract for sBTC escrow & state management
- **Payments:** Paystack (Ghana, Kenya) + Cinetpay (Togo, Senegal) for final settlement

The architecture separates concerns cleanly: the blockchain handles escrow & claim logic, the backend validates everything, and payment processors handle off-ramp to fiat. The entire design centers around security (challenge-response auth, signature verification) and auditability (on-chain events + webhook reconciliation).
