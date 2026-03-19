# BitExpress Codebase Documentation Index

Welcome! This directory now contains comprehensive documentation for understanding the BitExpress remittance platform. Use this index to find what you need.

---

## 📚 Documentation Files

### 1. **CODEBASE_ANALYSIS.md** ← START HERE
   **Complete technical deep-dive covering:**
   - Project purpose & end-to-end flow
   - Frontend architecture (React/Next.js, wallet integration, auth)
   - Backend services (Express.js, database, payment processors)
   - Smart contracts (Clarity language, functions, data structures)
   - Blockchain interactions (Stacks API, verification, sBTC)
   - Authentication & security (challenge-response, Firebase)
   - All API routes with examples
   - Data models and database schema
   
   **Best for:** Understanding the full system architecture
   **Time to read:** 30-45 minutes

---

### 2. **BLOCKCHAIN_PRIMER.md**
   **Introduction to blockchain concepts for traditional developers:**
   - What is Stacks (30-second explanation)
   - What is sBTC (wrapped Bitcoin)
   - Smart contracts explained
   - How transactions work (frontend to on-chain)
   - How the backend verifies on-chain state
   - Claim code cryptography (why hash the secret?)
   - Fee collection mechanics
   - Transfer state machine
   - Why this architecture matters
   - Common questions & answers
   
   **Best for:** Developers new to blockchain wanting conceptual understanding
   **Time to read:** 20 minutes

---

### 3. **USER_FLOWS_WITH_DATA.md**
   **Real-world scenarios with concrete data values:**
   - Scenario 1: Send ₿0.001 from Ghana to Kenya
   - Scenario 2: Claim & payout (receiver's side)
   - Scenario 3: Refund on expiry
   - Scenario 4: Failed payout recovery
   - Dashboard views
   - Turnkey wallet flow
   - Error scenarios & edge cases
   
   **Best for:** Understanding exact data transformations and flows
   **Time to read:** 15-20 minutes

---

### 4. **Repository Memory Files** (in `/memories/repo/`)
   
   **a) payout-flow-analysis.md**
   - Complete end-to-end payout flow phases
   - Real vs stub payment integrations
   - sBTC to fiat conversion
   - Configuration & API keys required
   - FX & pricing strategy
   - Known gaps & incomplete features
   - Provider coverage by country
   - Key database fields
   
   **b) bitexpress-stacks-setup.md**
   - sBTC token asset identifier notes
   - Contract version info
   - Fee and amount constraints
   
   **c) architecture-reference.md**
   - Three-layer architecture summary
   - Data flow sequences
   - Key design patterns
   - Critical files by function
   - Environment setup
   - Common issues & solutions

---

## 🗂️ Directory Structure

```
BitExpress/
├── CODEBASE_ANALYSIS.md           ← Full technical analysis
├── BLOCKCHAIN_PRIMER.md           ← Crypto/blockchain concepts
├── USER_FLOWS_WITH_DATA.md        ← Real-world scenarios
├── README.md                      ← Project overview
├── llm.txt                        ← LLM configuration
│
├── frontend/                      # Next.js React app
│   ├── src/
│   │   ├── app/                   # Page routes
│   │   ├── components/            # React components
│   │   ├── lib/                   # Utilities & integrations
│   │   └── types/                 # TypeScript definitions
│   └── package.json
│
├── backend/                       # Express.js API
│   ├── src/
│   │   ├── routes/                # API endpoints
│   │   ├── services/              # Business logic
│   │   ├── middleware/            # Auth & context
│   │   ├── utils/                 # Helpers
│   │   ├── db.ts                  # Data models
│   │   ├── index.ts               # Express app
│   │   └── __tests__/             # Unit tests
│   └── package.json
│
├── stacks-contracts/              # Smart contracts
│   ├── contracts/
│   │   ├── remittance-v4.clar    # Main contract (CURRENT)
│   │   └── [other contracts]
│   └── deployments/               # Network deployments
└── contracts/                     # Legacy contract location
```

---

## 🎯 Common Tasks & Where to Find Info

### "I want to understand the entire system"
1. Read CODEBASE_ANALYSIS.md (executive summary first)
2. Watch the architecture diagram
3. Skim USER_FLOWS_WITH_DATA.md for concrete examples

### "I want to add a new payment processor"
1. Check payout-flow-analysis.md for current integrations
2. Look at payoutService.ts (backend/src/services/)
3. Look at routes/webhooks.ts for webhook handling
4. BLOCKCHAIN_PRIMER.md is not needed; focus on backend

### "I want to understand how blockchain verification works"
1. Read BLOCKCHAIN_PRIMER.md sections 4-5
2. Check stacksVerificationService.ts code
3. Review relevant parts in CODEBASE_ANALYSIS.md section 5-6

### "I want to debug a failed claim"
1. Check USER_FLOWS_WITH_DATA.md error section
2. Look at routes/claim.ts to understand flow
3. Check stacksVerificationService.ts for validation logic
4. Verify transfer record in database

### "I want to add a new country"
1. Check config.ts for country metadata structure
2. Update SUPPORTED_COUNTRIES in config
3. Choose payment processor (Paystack or Cinetpay)
4. Test with mock payout (no real funds needed)

### "I want to understand the frontend wallet integration"
1. Read WalletProvider.tsx (components/)
2. Check lib/stacks.ts for transaction building
3. Review lib/firebaseAuth.ts for auth tokens
4. BLOCKCHAIN_PRIMER.md section 2 for concepts

### "I want to understand idempotency/duplicate prevention"
1. Check utils/idempotency.ts implementation
2. See routes/send.ts and routes/claim.ts usage
3. Look at db.ts for getIdempotencyRecord() and saveIdempotencyRecord()

---

## 🔧 Quick Reference

### Key Backend Routes
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| /api/auth/challenge | POST | No | Get signature challenge |
| /api/auth/verify | POST | No | Verify & mint Firebase token |
| /api/send | POST | Yes | Create remittance |
| /api/claim | POST | Yes | Claim & trigger payout |
| /api/transaction/:id | GET | Yes | Fetch transfer details |
| /api/exchange-rate | GET | No | Get USD→local FX rate |
| /api/webhooks/paystack/transfer | POST | No* | Paystack callback |
| /api/webhooks/cinetpay/transfer | POST | No* | Cinetpay callback |
| /api/webhooks/btc/deposit | POST | No* | BTC deposit lifecycle callback (pending/confirmed) |

### Key Smart Contract Functions
```clarity
send-remittance(receiver, amount, source-country, dest-country, claim-code-hash)
  → Returns: (ok transfer-id)
  → Escrows sBTC in contract

claim-remittance(transfer-id, claim-secret)
  → Returns: (ok)
  → Verifies secret, transfers net to receiver, fee to deployer

refund-remittance(transfer-id)
  → Returns: (ok)
  → Requires 24+ hours passed, transfers full amount back to sender
```

### Key Frontend Components
- **WalletProvider.tsx** - Manages Leather + Turnkey wallet state
- **send/page.tsx** - Send remittance form & transaction signing
- **receive/page.tsx** - Claim interface & status tracking
- **dashboard/page.tsx** - Transaction history

### Key Services
- **stacksVerificationService.ts** - Verify on-chain transactions
- **payoutService.ts** - Call Paystack/Cinetpay APIs
- **fxService.ts** - USD ↔ local currency conversion
- **authService.ts** - Signature verification & token minting

---

## 💡 Design Patterns Used

### 1. Challenge-Response Authentication
```
GET /challenge → nonce
User signs: sign(message, privateKey)
POST /verify → Firebase token
All protected routes: Bearer token
```

### 2. On-Chain Verification Before Off-Chain Action
```
User signs on-chain transaction
Frontend broadcasts & waits for confirmation
Backend verifies via Stacks API before proceeding with payout
(Can't be fooled by frontend claims)
```

### 3. Idempotent Requests
```
Every send/claim requires Idempotency-Key header
Same key → cached response returned
Prevents duplicate transfers from network retries
```

### 4. Webhook-Based Async Reconciliation
```
Backend initiates payout → stores reference
(Payment processor processes asynchronously)
Webhook fires → backend updates status
(No polling required)
```

### 5. Hash + Pre-Image for Privacy
```
Claim code: random 32 bytes
On-chain storage: sha256(claim code)
To claim: provide pre-image, contract verifies hash
(Secret never stored on-chain)
```

---

## 🚀 Development Setup

### Frontend
```bash
cd frontend
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 npm run dev
# Opens http://localhost:3000
```

### Backend
```bash
cd backend
npm install
npm run dev
# Starts on http://localhost:4000
```

### Smart Contracts
```bash
cd stacks-contracts
npm install
npm run test
# Runs Clarinet tests
```

### Environment Variables
See `.env.example` files in frontend/ and backend/
Most important:
- Frontend: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_STACKS_NETWORK`
- Backend: `PAYSTACK_SECRET_KEY`, `CINETPAY_API_KEY`, `CONTRACT_ADDRESS`, `DEPLOYER_WALLET`

---

## 📱 Test Account Setup

### Testnet Faucet
Get free testnet STX (for gas fees):
1. Visit: https://testnet-faucet.blockstack.org/
2. Paste your Stacks testnet address (ST...)
3. Receive STX in wallet

### Mock sBTC Balance
On testnet, use the `.sbtc-token-v3` contract to mint test sBTC:
```clarity
(contract-call? .sbtc-token-v3 mint u100000000 tx-sender)
```
(Or your wallet extension has a "mint" button)

### Test Paystack Integration
Use Paystack test keys:
- Create account at https://dashboard.paystack.com/
- Go to Settings → API Keys
- Copy **Test** keys (contains "sk_test_...")
- Add to `.env`

---

## 🐛 Debugging Tips

### Frontend Wallet Connection Issues
- Check browser console for errors
- Leverage `logClientInfo()` and `logClientError()` in lib/debug.ts
- Ensure Leather extension is installed and enabled
- For Turnkey, check Turnkey project configuration

### Backend API Issues
- Check `npm run dev` logs for errors
- Verify Firebase/Paystack/Cinetpay credentials are set
- Check Stacks API connectivity: `curl https://api.testnet.hiro.so/health`
- Use Postman to test endpoints directly

### Blockchain Transaction Issues
- Check Stacks explorer: https://explorer.hiro.so/ (testnet)
- Look for tx_status = "success" (takes 1-2 min)
- If "abort_by_post_condition": post-condition mode issue in wallet

---

## 📖 External Resources

### Stacks/Blockchain
- Stacks docs: https://docs.stacks.co/
- sBTC docs: https://www.stacks.network/layers-of-stacks
- Clarity language: https://docs.stacks.co/clarity
- Testnet explorer: https://explorer.hiro.so/

### Payment Processors
- Paystack API: https://paystack.com/docs/api/
- Cinetpay API: https://cinetpay.com/en/api/

### Libraries Used
- Stacks Connect: https://docs.stacks.co/get-started/stacks-jes
- Stacks.js: https://docs.stacks.co/stacks-js
- Turnkey: https://docs.turnkey.com/
- Firebase: https://firebase.google.com/docs

---

## ❓ FAQ

**Q: Where is the most current contract deployed?**
A: stacks-contracts/contracts/remittance-v4.clar

**Q: How do I test without real money?**
A: Use testnet (NEXT_PUBLIC_STACKS_NETWORK=testnet) and mint mock sBTC.

**Q: How long does a payment take?**
A: Stacks block: ~1-2 min, Payout: ~2-5 min, Total: ~5 min

**Q: Can I run the full stack locally?**
A: Yes! Frontend on 3000, backend on 4000, use testnet Stacks API

**Q: What if Paystack/Cinetpay API is down?**
A: On-chain claim succeeds, but payout fails. Use webhook retry logic.

**Q: Is there a database migration needed?**
A: Currently using in-memory Maps. To use Firestore, swap in DB adapter (see db.ts comments)

---

## 📝 Document Versions

- **CODEBASE_ANALYSIS.md** - v1.0 (2026-03-19)
  Current as of remittance-v4 contract
  Covers sbtc-token-v3 asset
  
- **BLOCKCHAIN_PRIMER.md** - v1.0 (2026-03-19)
  Suitable for developers unfamiliar with blockchain
  Uses BitExpress as concrete examples
  
- **USER_FLOWS_WITH_DATA.md** - v1.0 (2026-03-19)
  Real-world scenarios with calculated values
  Covers all major flows and error cases

---

## 🤝 Contributing

When updating code:
1. Update relevant section in CODEBASE_ANALYSIS.md
2. Add notes to memory files in `/memories/repo/`
3. Update quick reference tables if adding routes/functions
4. Add examples to USER_FLOWS_WITH_DATA.md if new user flows

---

**Last Updated:** 2026-03-19
**Documentation Complexity:** Advanced (requires understanding of:)
- React/Next.js
- Express.js
- AWS/Firebase
- Smart contracts & blockchain basics
- Crypto payment processing

**Suitable for:** Full-stack developers, blockchain engineers, payment system architects

---
