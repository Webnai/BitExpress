# Documentation Sync System

## Purpose
This file provides documentation context synchronization guidelines for AI tools (LLMs) working with the BitExpress project built on the Stacks blockchain.

## Project Structure

### Smart Contracts (Clarinet Project)
- **Location:** `stacks-contracts/`
- **Primary Contract:** `remittance.clar` - Main remittance logic
- **Supporting Contract:** `sbtc-token.clar` - sBTC token implementation
- **Testing Framework:** Rendezvouz (Clarity fuzzer)
- **Configuration:** `Clarinet.toml`, network settings in `settings/`

### Backend (Express + TypeScript)
- **Location:** `backend/`
- **Framework:** Express.js with TypeScript
- **Testing:** Jest
- **Key Services:** 
  - Auth service
  - FX (Foreign Exchange) service
  - Payout service
  - Notification service
  - Stacks verification service

### Frontend (Next.js)
- **Location:** `frontend/`
- **Framework:** Next.js with React 19
- **Styling:** Tailwind CSS
- **Services:**
  - Firebase authentication
  - Stacks blockchain integration
  - API communication with backend

## Testing Strategy

### Smart Contract Testing with Rendezvouz
BitExpress uses Rendezvouz for property-based fuzzing tests on Clarity contracts:

**Property-Based Tests:** Located in `contracts/*.tests.clar`
- Function names start with `test-`
- Must be `public` functions
- Return `(ok true)` on success
- Test invariants and properties of the contract state

**Invariant Tests:** 
- Function names start with `invariant-`
- Must be `read-only` functions
- Return boolean (true if invariant holds)
- Can use special `context` map to access execution history

### Backend Testing
Jest tests located in `__tests__/` for:
- API route testing
- Service logic validation
- Stacks verification

### Frontend Testing
Unit and integration tests for React components and API integrations.

## Key Configuration Files

### Stacks Contracts
- `Clarinet.toml` - Project configuration and contract dependencies
- `settings/Devnet.toml` - Local development network settings
- `settings/Testnet.toml` - Testnet configuration
- `settings/Mainnet.toml` - Mainnet configuration

### Backend
- `backend/package.json` - Dependencies and scripts
- `backend/tsconfig.json` - TypeScript configuration
- `.env` - Environment variables (Firebase, Stacks network config)

### Frontend
- `frontend/package.json` - Dependencies (removed Playwright)
- `frontend/.env` - Public env variables
- `next.config.ts` - Next.js configuration

## Important Constants

### Contract Configuration
- **Contract Address (Testnet):** `ST22XTWYXH14VK7SQYEAMKRKRS9BZ32QXJPQNZ7FN`
- **Contract Name:** `remittance-v3`
- **sBTC Asset:** `ST22XTWYXH14VK7SQYEAMKRKRS9BZ32QXJPQNZ7FN.sbtc-token-v3::sbtc`

### Network Configuration
- **Frontend Target Network:** Testnet
- **Backend API Base URL:** `http://localhost:4000`
- **Frontend Dev Server:** `http://127.0.0.1:3000`

## Documentation Updates Checklist

When changes are made to smart contracts, services, or APIs:

- [ ] Update relevant `.clar` contract documentation
- [ ] Add/update Rendezvouz test cases for new functions
- [ ] Update backend API documentation
- [ ] Update frontend component documentation
- [ ] Update `.env` examples if configuration changes
- [ ] Update this CLAUDE.md with new constants or conventions

## Running Tests

### Rendezvouz Tests (Smart Contracts)
```bash
cd stacks-contracts
npm install @stacks/rendezvous
npx rendezvous <contract-name> test
npx rendezvous <contract-name> invariant
```

### Backend Tests
```bash
cd backend
npm test
```

### All Tests
Run from project root to test all components.
