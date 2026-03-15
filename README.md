# BitExpress ₿

**Bitcoin-secured remittance infrastructure for Africa** — A low-fee cross-border payment network built on Stacks that enables people to send value across African corridors with ~1% fees and near-instant settlement.

> Compare: Western Union / MoneyGram charge **7–10%**. BitExpress charges **~1%**.

---

## 🌍 Supported Countries

| Country | Currency | Mobile Money |
|---------|----------|--------------|
| 🇬🇭 Ghana | GHS | MTN MoMo |
| 🇳🇬 Nigeria | NGN | Flutterwave |
| 🇰🇪 Kenya | KES | M-Pesa |
| 🇹🇬 Togo | XOF | Moov Money |
| 🇸🇳 Senegal | XOF | Orange Money |
| 🇹🇿 Tanzania | TZS | Vodacom M-Pesa |
| 🇺🇬 Uganda | UGX | MTN MoMo |

---

## 🏗️ Architecture

```
User A (Ghana)
   │ send USDCx on Stacks
   │
   ▼
Stacks Smart Contract (Clarity)
   │
   ▼
Receiver Wallet
   │
   ▼
Local off-ramp partner
   │
   ▼
Mobile Money / Bank
```

---

## 📁 Project Structure

```
BitExpress/
├── contracts/
│   └── remittance.clar          # Clarity smart contract
├── frontend/                     # Next.js 16 + TypeScript + TailwindCSS
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Landing page
│   │   │   ├── send/page.tsx     # Send money page
│   │   │   ├── receive/page.tsx  # Claim/receive page
│   │   │   └── dashboard/page.tsx# Dashboard
│   │   ├── components/
│   │   │   └── Navbar.tsx
│   │   ├── lib/
│   │   │   └── api.ts            # API client
│   │   └── types/
│   │       └── index.ts
│   └── .env.example
└── backend/                      # Node.js + Express API
    ├── src/
    │   ├── index.ts              # Express app
    │   ├── config.ts             # Configuration
    │   ├── db.ts                 # In-memory database
    │   ├── routes/
    │   │   ├── send.ts           # POST /api/send
    │   │   ├── claim.ts          # POST /api/claim
    │   │   ├── transaction.ts    # GET /api/transaction/:id
    │   │   └── exchangeRate.ts   # GET /api/exchange-rate
    │   └── services/
    │       ├── fxService.ts      # FX rate conversion
    │       ├── payoutService.ts  # Mobile money off-ramp
    │       └── notificationService.ts # SMS/email alerts
    └── .env.example
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
# API runs on http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
# App runs on http://localhost:3000
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/send` | Initiate a transfer |
| `POST` | `/api/claim` | Claim a pending transfer |
| `GET` | `/api/transaction/:id` | Get transfer by ID |
| `GET` | `/api/transaction/wallet/:address` | Get wallet history |
| `POST` | `/api/transaction/:id/refund` | Refund expired transfer |
| `GET` | `/api/exchange-rate` | All exchange rates |
| `GET` | `/api/exchange-rate/:country` | Rate for specific country |
| `POST` | `/api/exchange-rate/convert` | Convert between currencies |
| `GET` | `/api/exchange-rate/estimate/:usd` | Estimate local amounts |

### Example: Send Transfer

> **Note:** All mutating endpoints require an `Authorization: Bearer <token>` header (obtained from wallet auth) and an `Idempotency-Key` UUID header. The `/api/send` example below is illustrative — use the frontend for a working demo.

```bash
# 1. Get an auth challenge
curl -X POST http://localhost:4000/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"ST..."}'

# 2. After signing, exchange the signature for a Firebase token
# (see /api/auth/verify — returns customToken for Firebase sign-in)

# 3. Exchange rates (unauthenticated)
curl http://localhost:4000/api/exchange-rate
```

---

## 📜 Smart Contract (Clarity)

The `contracts/remittance.clar` contract implements:

- **`send-remittance`** — Lock USDCx in escrow with claim secret hash
- **`claim-remittance`** — Receiver claims with secret, funds released
- **`refund-remittance`** — Sender refunds after 24h timeout
- **`get-transfer-status`** — Read transfer state
- **`get-reputation`** — Read user reputation score

### Fee Structure
- Platform fee: **1%** (configurable via `FEE-BASIS-POINTS`)
- Transfer limits: **1 USDCx** minimum, **10,000 USDCx** maximum
- Timeout: **144 blocks** (~24 hours)

---

## 🎬 Demo Script (End-to-End)

Follow these steps to run a complete send→claim flow:

### Prerequisites
- Two Stacks wallets loaded with testnet USDCx (Leather or Xverse)
- Both backend and frontend running locally

### Step 1 — Send (Sender wallet)
1. Open `http://localhost:3000/send`
2. Connect **Sender** wallet
3. Fill in: Recipient Country → Nigeria, Recipient Name, Recipient Wallet (second wallet address)
4. Set Amount (e.g. $20), select Crypto Wallet payout method
5. Click **Send Money** → wallet popup opens → confirm the `send-remittance` contract call
6. After broadcast: **copy the Claim Secret** shown in the sidebar (copy button) and share it securely with the receiver
7. Also note the **Transfer ID** shown in the result

### Step 2 — Claim (Receiver wallet)
1. Open `http://localhost:3000/receive` (or follow link from sender)
2. Connect **Receiver** wallet
3. Enter the **Transfer ID** and click Load Transfer
4. Paste the **Claim Secret** shared by the sender
5. Click **Claim Funds** → wallet popup opens → confirm the `claim-remittance` contract call
6. Once the tx confirms, the backend processes the payout simulation
7. Explorer links are shown for both the send and claim transactions

### Step 3 — Track
1. Open `http://localhost:3000/track`
2. Enter the Transfer ID → see status "Claimed" with explorer links for send, claim, and (if applicable) refund transactions

### Refund (optional, after 24h timeout)
1. On `http://localhost:3000/dashboard` with the sender wallet connected
2. Pending transfers older than 24h show a **Refund** button
3. Click Refund → confirm `refund-remittance` contract call → USDCx returned to sender

---



```bash
cd backend
npm test
# API and verification tests across health, exchange rates, send, claim, refund, and transaction flows
```

---

## 🔒 Security

- Smart contract escrow — funds only released on valid claim
- Rate limiting (100 req/15min per IP)
- Helmet security headers
- Transfer size limits
- 24-hour refund timeout
- On-chain reputation tracking

---

## 💰 Fee Model

| Revenue Stream | Rate |
|----------------|------|
| Transaction fee | 0.5–1% |
| FX spread | 0.2–0.5% |
| Merchant API | Subscription |

---

## 🛣️ Roadmap

- [x] Core smart contract (Clarity)
- [x] REST API backend
- [x] Next.js frontend
- [x] Mobile money simulation
- [x] FX rate service
- [x] SMS notification service
- [x] Live Stacks wallet integration (Leather/Xverse)
- [x] On-chain send/claim/refund verification in backend
- [ ] Real mobile money API integration
- [ ] Liquidity pools
- [ ] SMS transfer (send to phone number)
- [ ] Firebase persistence

---

*Built on [Stacks](https://stacks.co) with Clarity smart contracts and USDCx settlement rails — secured by Bitcoin*
