# BitExpress Blockchain Primer for Full-Stack Developers

## What is the Stacks Blockchain? (30-Second Version)

**Stacks** is a "Layer 2" on top of Bitcoin that enables smart contracts. Think of it like:
- Bitcoin = immutable ledger of Bitcoin transactions
- Stacks = application layer that taps Bitcoin's security

Key point: **Stacks transactions are settled on Bitcoin every ~1-2 minutes**, so they inherit Bitcoin's security.

### Why Stacks Instead of Ethereum?
- sBTC (Bitcoin wrapped on Stacks) = actual Bitcoin, not an IOU
- 1:1 peg with real Bitcoin
- Transactions are cheap (~$0.01) but include Bitcoin finality

---

## What is sBTC? (Wrapped Bitcoin)

```
Bitcoin Mainnet                  Stacks Layer 2
─────────────────                ──────────────
1 BTC                     ←→     1 sBTC = 100,000,000 satoshis
(real Bitcoin)                   (can be unwrapped back)
```

**In BitExpress:**
- Users send their real sBTC (which they own)
- sBTC gets locked in contract escrow
- On claim, sBTC is transferred from contract to receiver
- At no point is there a "peg-out" (sBTC → Bitcoin mainnet); it just moves wallets on Stacks

---

## Core Blockchain Concepts Used in BitExpress

### 1. Smart Contract (Clarity Language)

**What it is:**
- A program that runs on blockchain
- Immutable once deployed
- Anyone can call it; code execution is transparent

**Why use it:**
- Escrow sBTC without trusting a company
- Fee calculation is transparent and automatic
- Claim code validation happens on-chain (no backend compromise = no lost money)

**BitExpress contract:**
```clarity
(send-remittance sender receiver amount claim-code-hash)
  ↓
  Sender sends sBTC to contract
  Contract stores transfer record with claim-code-hash
  
(claim-remittance transfer-id claim-secret)
  ↓
  Receiver provides claim-secret
  Contract checks: sha256(claim-secret) == stored claim-code-hash?
  If yes: transfer net-amount to receiver, fee to deployer
  If no: transaction fails
```

### 2. Principal (Wallet Address on Stacks)

```
Stacks Address Examples:
ST1234567890ABCDEFGHIJKLMNOPQRST1A2BC3D  (testnet, 41 chars)
SM1234567890ABCDEFGHIJKLMNOPQRST1A2BC3D  (testnet, 41 chars)
SP1234567890ABCDEFGHIJKLMNOPQRST1A2BC3D  (mainnet, 41 chars)
```

Each address is backed by a 256-bit public key (same curve as Bitcoin).

### 3. Transactions

**On Stacks, a transaction can:**
- Transfer tokens (like sBTC)
- Call smart contract functions
- Update contract data

**In BitExpress:**

**Example: Send remittance**
```
from: ST1234... (sender's wallet)
function: send-remittance
arguments: [
  receiver: ST5678...,
  amount: 100000,              // satoshis
  sourceCountry: "GHA",
  destCountry: "KEN",
  claimCodeHash: 0x12ab34cd... // sha256 of secret
]
```

The Stacks network:
1. Verifies sender owns the address (via signature check)
2. Executes the function
3. Transfers sBTC from sender to contract
4. Updates contract data
5. Returns transfer-id (e.g., 42)

**Example: Claim remittance**
```
from: ST5678... (intended receiver)
function: claim-remittance
arguments: [
  transferId: 42,
  claimSecret: 0xabcd1234... // pre-image of hash
]
```

The contract:
1. Looks up transfer #42
2. Computes sha256(claimSecret)
3. Compares to stored hash
4. If match: transfers sBTC from contract to receiver
5. Returns error if no match

---

## How Frontend Sends a Transaction

### Step 1: Build Transaction (Frontend)

Backend sends this to Stacks Connect library:

```typescript
// From frontend/src/lib/stacks.ts
const response = await request("stx_callContract", {
  contract: "ST1XXXXX.remittance-v4",
  functionName: "send-remittance",
  functionArgs: [
    Cl.principal(receiverWallet),      // ST5678... as principal
    Cl.uint(amountSatoshis),           // 100000 as uint
    Cl.stringAscii(sourceCountry),     // "GHA" as ascii string
    Cl.stringAscii(destCountry),       // "KEN" as ascii string
    Cl.bufferFromHex(claimSecretHex),  // 0x1234... as buffer (bytes)
  ],
  postConditionMode: "allow",  // Allow any token transfers (or restrict via post-conditions)
});
```

`Cl.*` functions convert JavaScript values to Clarity types.

### Step 2: User Signs (Wallet)

**Leather Wallet:**
```
User sees popup:
"ST1XXXXX.remittance-v4 requests to send 100000 satoshis"
[Sign] [Cancel]

User clicks Sign →
  Wallet extracts user's private key
  Wallet signs the transaction
  Transaction sent to Stacks network
```

**Turnkey Wallet:**
```
User is already authenticated to Turnkey
Turnkey embedded SDK manages keys
Frontend calls Turnkey SDK:
  signTransaction(tx) → signed tx
Turnkey backend has encrypted private key
Returns signed tx to frontend
```

### Step 3: Network Processes

```
Frontend broadcasts signed tx
       ↓
Stacks mempool (transaction waiting pool)
       ↓
Stacks miners include tx in next block (~1-2 min)
       ↓
Contract code executed:
  - sBTC transfer happens
  - Contract state updated
  - Events emitted
       ↓
Block settles on Bitcoin layer (~1-2 min later)
       ↓
"Transaction is final"
```

---

## How Backend Verifies On-Chain State

### Step 1: Transaction Is Broadcast

Frontend calls Stacks Connect, gets back:
```javascript
{
  txid: "0x1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF"
}
```

**Note:** At this point, tx might still be pending/confirming. Frontend waits for confirmation.

### Step 2: Backend Fetches Transaction Details

```typescript
// From backend/src/services/stacksVerificationService.ts
GET https://api.testnet.hiro.so/extended/v1/tx/{txid}
```

Response:
```json
{
  "tx_id": "0x1234...",
  "tx_status": "success",
  "tx_type": "contract_call",
  "sender_address": "ST1234...",
  "contract_call": {
    "contract_id": "ST1XXXXX.remittance-v4",
    "function_name": "send-remittance",
    "function_args": [...]
  },
  "events": [
    {
      "event_type": "fungible_token_transfer",
      "asset_identifier": "ST1XXXXX.sbtc-token-v3::sbtc",
      "sender": "ST1234...",
      "recipient": "ST1XXXXX",  // contract principal
      "amount": "100000"
    }
  ],
  "tx_result": {
    "repr": "(ok u42)"  // transfer-id returned by contract
  }
}
```

### Step 3: Backend Validates

```typescript
// Pseudocode from stacksVerificationService.ts
if (tx.tx_status !== "success") {
  return { ok: false, reason: "Transaction failed on-chain" };
}

if (tx.tx_type !== "contract_call") {
  return { ok: false, reason: "Not a contract call" };
}

if (tx.sender_address !== expectedSender) {
  return { ok: false, reason: "Wrong sender" };
}

if (tx.contract_call.function_name !== "send-remittance") {
  return { ok: false, reason: "Wrong function" };
}

// Extract transfer ID from result
const match = tx.tx_result.repr.match(/^\(ok u(\d+)\)$/);
const transferId = match ? parseInt(match[1]) : null;

if (!transferId) {
  return { ok: false, reason: "Could not extract transfer ID" };
}

// Validate sBTC event
const sbtcEvent = tx.events.find(e => 
  e.event_type === "fungible_token_transfer" &&
  e.asset_identifier.includes("sbtc")
);

if (!sbtcEvent || sbtcEvent.amount !== expectedAmount) {
  return { ok: false, reason: "sBTC transfer mismatch" };
}

return { ok: true, onChainTransferId: transferId };
```

---

## Claim Code: A Crypto Concept

### Why Hash the Secret?

**On-chain storage is public!** Anyone can read contract data.

```
If stored plaintext:
  Transfer {id: 42, claimSecret: "abc123"}
  
Anyone watching the blockchain sees: "abc123"
They can immediately claim without SMS confirmation!
```

**Instead, store the hash:**
```
Transfer {id: 42, claimCodeHash: sha256("abc123")}

To claim, provide pre-image: "abc123"
Contract verifies: sha256("abc123") == stored hash?

Even if someone captures the transfer creation event,
they don't see "abc123"
```

### How It Works in BitExpress

```
SEND:
1. Frontend generates 32-byte random secret: "abcd1234..."
2. Frontend computes hash: sha256("abcd1234...") → "xyz789..."
3. Frontend sends to contract with hash (not secret!)
4. Frontend displays secret to user: "Claim code: abcd1234..."
5. User forwards claim code via SMS (outside blockchain)

CLAIM:
1. User receives SMS with secret
2. User signs claim transaction with secret (pre-image)
3. Contract verifies sha256(secret) == stored hash
4. Contract transfers sBTC
```

**Security benefit:**
- Blockchain watcher sees hash, not secret
- Secret only transmitted once via SMS
- Even if SMS is captured, can only claim if user provides claim code
- Prevents casual theft (high-value theft would require SMS + SMS read access)

---

## Fee Collection (On-Chain Math)

### How 1% Fee Works

```
User sends: 100,000 satoshis
Fee (1%): 100,000 * 100 / 10,000 = 1,000 satoshis
Net: 100,000 - 1,000 = 99,000 satoshis

On claim:
- Receiver gets: 99,000 satoshis (on-chain)
- Deployer gets: 1,000 satoshis (fee)
Both happen in same transaction, atomically
```

**Why on-chain?**
- No backend can redirect funds
- Fee is fixed and transparent
- No "loss in translation" between sBTC and fiat

---

## Transfer State Machine

```
PENDING (after send-remittance)
   ↓
   ├─→ CLAIMED (after claim-remittance)
   │
   └─→ REFUNDED (after refund-remittance, if expired)


PENDING: sBTC locked in contract, awaiting claim
  - Claim deadline: block_height + 144 blocks (~24 hours)
  - Only receiver can claim

CLAIMED: sBTC has moved from contract to receiver
  - Receiver got net-amount
  - Deployer got fee
  - Irreversible

REFUNDED: 24 hours passed, sender initiated refund
  - Sender gets back full original amount (minus gas)
  - Receiver can no longer claim
  - Deployer fee forfeited (back to sender)
```

---

## Contract Events (Read-Only Metadata)

Smart contracts emit **events** as they execute. Events are:
- Read-only (can't change contract state)
- Indexed by Stacks API for easy lookup
- Used for notifications and off-chain data

**Example events from send-remittance:**
```
Event 1: fungible_token_transfer
  asset: "ST1XXXXX.sbtc-token-v3::sbtc"
  from: ST1234...
  to: ST1XXXXX  // contract
  amount: 100000

Event 2: contract_data_changed
  // (contract stores internal state)
```

Backend listens for these via API polling, not subscriptions.

---

## Why This Architecture?

### The Problem It Solves

```
Traditional Remittance:
Sender → [Western Union centralized server] → Receiver
         (trust WU, WU takes 7-10%, slow)

BitExpress:
Sender → [Stacks Smart Contract] → Receiver
         (no trust needed, 1% fee, transparent)
         
Backend handles off-ramp to fiat only
(Backend + Paystack can't change on-chain state)
```

### Security Model

```
BLOCKCHAIN LAYER (Immutable)
┌─────────────────────────────────┐
│ Smart contract holds sBTC       │
│ Claim code verified on-chain    │
│ Fees calculated by code         │
│ (can't be hacked by backend)    │
└─────────────────────────────────┘

BACKEND LAYER (Best-effort)
┌─────────────────────────────────┐
│ Converts USD→LC currency        │
│ Calls Paystack/Cinetpay        │
│ Stores user transactions       │
│ (issues here don't lose sBTC)   │
└─────────────────────────────────┘

PAYMENT PROCESSOR (Trusted 3rd party)
┌─────────────────────────────────┐
│ Delivers mobile money to phone  │
│ (webhook updates our DB)        │
└─────────────────────────────────┘
```

If backend is hacked:
- ✅ sBTC stays locked in contract (can't be stolen)
- ❌ Payout to mobile money might be misdirected

If payment processor hacked:
- ✅ sBTC already delivered to receiver
- ❌ Mobile money settlement might fail

---

## Testing Without Real sBTC

During development, you can:

1. **Use testnet** (all values are mock, no real Bitcoin at stake)
2. **Deploy mock sBTC token** (`.sbtc-token-v3` is a simple SIP-010 contract that mints unlimited tokens)
3. **E2E mode** (hardcoded mock transaction IDs, skips blockchain verification)

```env
# .env.local or .env
NEXT_PUBLIC_STACKS_NETWORK=testnet
NODE_ENV=development  # Skip webhook signatures, use mock tx IDs
```

---

## Common Questions

**Q: What if the Stacks network is down?**
- Send/claim will fail at wallet signing step
- User is notified immediately
- No transaction reaches the blockchain

**Q: Can the backend approve/reject transfers?**
- No! The contract execution is autonomous
- Backend can only verify what already happened

**Q: Why not just use Bitcoin directly?**
- Bitcoin has no smart contracts (by design)
- Stacks adds contract capability while inheriting Bitcoin security

**Q: Is sBTC safe? Can it be hacked?**
- As safe as Bitcoin (same cryptography)
- Smart contract code can be audited
- Stacks protocol is maintained by community

**Q: What's the cost (gas fees)?**
- ~$0.01 per transaction (cheap!)
- Paid from Stacks fee token (STX), not sBTC
- Users need small amount of STX to pay gas

---

## Further Reading

- **Stacks docs:** https://docs.stacks.co/
- **sBTC docs:** https://www.stacks.network/layers-of-stacks
- **Clarity language:** https://docs.stacks.co/clarity
- **Bitcoin @ scale:** https://bitcoinstack.org/

---

