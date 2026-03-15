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

```bash
curl -X POST http://localhost:4000/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "senderWallet": "SP1ABC...SENDER",
    "receiverWallet": "SP2DEF...RECEIVER",
    "amountUsd": 20,
    "sourceCountry": "GHA",
    "destCountry": "NGA",
    "recipientPhone": "+2348012345678",
    "recipientName": "John Doe",
    "payoutMethod": "mobile_money"
  }'
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

## 🧪 Running Tests

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
