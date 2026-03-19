import request from "supertest";

import { getDeployerWallet } from "../config";
import { assertFirestoreConfigForProduction } from "../db";
import { db } from "../db";
import app from "../index";
import * as authService from "../services/authService";

function authHeader(wallet: string, uid = `uid-${wallet}`): string {
  return `Bearer test-token:${uid}:${wallet}`;
}

describe("BitExpress API", () => {
  describe("POST /api/auth/verify", () => {
    it("returns custom token and creates a user profile on first login", async () => {
      const walletAddress = `SPAUTH${Date.now()}`;

      const verifySpy = jest
        .spyOn(authService, "verifyAuthChallengeAndMintToken")
        .mockResolvedValue("custom-token-auth-test");

      const res = await request(app).post("/api/auth/verify").send({
        walletAddress,
        nonce: "nonce-test",
        signature: "signature-test",
        publicKey: "publickey-test",
      });

      expect(res.status).toBe(200);
      expect(res.body.customToken).toBe("custom-token-auth-test");
      expect(res.body.walletAddress).toBe(walletAddress);
      expect(verifySpy).toHaveBeenCalledWith({
        walletAddress,
        nonce: "nonce-test",
        signature: "signature-test",
        publicKey: "publickey-test",
      });

      const user = await db.getUserByWallet(walletAddress);
      expect(user).toBeDefined();
      expect(user?.walletAddress).toBe(walletAddress);
      expect(user?.country).toBe("unknown");

      verifySpy.mockRestore();
    });
  });

  describe("GET /health", () => {
    it("returns healthy status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("BitExpress API");
    });
  });

  describe("GET /api/exchange-rate", () => {
    it("returns all exchange rates", async () => {
      const res = await request(app).get("/api/exchange-rate");
      expect(res.status).toBe(200);
      expect(res.body.rates).toBeDefined();
      expect(res.body.supportedCountries).toBeInstanceOf(Array);
      expect(res.body.supportedCountries.length).toBeGreaterThan(0);
    });

    it("returns rate for Ghana (GHA)", async () => {
      const res = await request(app).get("/api/exchange-rate/GHA");
      expect(res.status).toBe(200);
      expect(res.body.rate.from).toBe("BTC");
      expect(res.body.rate.to).toBe("GHS");
      expect(res.body.rate.rate).toBeGreaterThan(0);
    });
  });

  describe("POST /api/send", () => {
    it("rejects requests without auth", async () => {
      const res = await request(app)
        .post("/api/send")
        .set("Idempotency-Key", "send-no-auth")
        .send({
          receiverWallet: "SP2DEF...RECEIVER",
          amountUsd: 20,
          sourceCountry: "GHA",
          destCountry: "NGA",
        });

      expect(res.status).toBe(401);
    });

    it("creates a new transfer", async () => {
      const res = await request(app)
        .post("/api/send")
        .set("Authorization", authHeader("SP1ABC...SENDER"))
        .set("Idempotency-Key", "send-create-1")
        .send({
          receiverWallet: "SP2DEF...RECEIVER",
          amountUsd: 20,
          sourceCountry: "GHA",
          destCountry: "GHA",
          recipientPhone: "+233551234567",
          recipientName: "John Doe",
          recipientMobileProvider: "MTN",
          payoutMethod: "mobile_money",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.transfer.id).toBeDefined();
      expect(res.body.transfer.status).toBe("pending");
      expect(res.body.transfer.fee).toBeCloseTo(0.2, 5);
      expect(res.body.transfer.netAmount).toBeCloseTo(19.8, 5);
      expect(res.body.transfer.receiverWallet).toBe(getDeployerWallet());
      expect(res.body.transfer.claimAuthorization).toBe("operator_only");
    });

    it("returns same response for same idempotency key", async () => {
      const payload = {
        receiverWallet: "SP2REPEAT",
        amountUsd: 25,
        sourceCountry: "GHA",
        destCountry: "GHA",
        recipientPhone: "+233551234568",
        recipientName: "Repeat Recipient",
        recipientMobileProvider: "MTN",
        payoutMethod: "mobile_money",
      };

      const first = await request(app)
        .post("/api/send")
        .set("Authorization", authHeader("SP1IDEMP"))
        .set("Idempotency-Key", "send-idem-1")
        .send(payload);

      const second = await request(app)
        .post("/api/send")
        .set("Authorization", authHeader("SP1IDEMP"))
        .set("Idempotency-Key", "send-idem-1")
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.transfer.id).toBe(first.body.transfer.id);
    });

    it("rejects unsupported live mobile-money corridors", async () => {
      const res = await request(app)
        .post("/api/send")
        .set("Authorization", authHeader("SP1ABC...SENDER"))
        .set("Idempotency-Key", "send-unsupported-mm")
        .send({
          receiverWallet: "SP2DEF...RECEIVER",
          amountUsd: 20,
          sourceCountry: "GHA",
          destCountry: "TZA",
          recipientPhone: "+2348012345678",
          recipientName: "John Doe",
          recipientMobileProvider: "MTN",
          payoutMethod: "mobile_money",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not available/i);
    });
  });

  describe("POST /api/claim + GET /api/transaction", () => {
    let transferId: string;

    beforeEach(async () => {
      const sendRes = await request(app)
        .post("/api/send")
        .set("Authorization", authHeader("SP1SENDER"))
        .set("Idempotency-Key", `send-claim-seed-${Date.now()}`)
        .send({
          receiverWallet: "SP2RECEIVER",
          amountUsd: 50,
          sourceCountry: "KEN",
          destCountry: "SEN",
          recipientPhone: "+221771234567",
          recipientName: "Jane Smith",
          recipientMobileProvider: "OMSN",
          payoutMethod: "mobile_money",
        });

      transferId = sendRes.body.transfer.id;
    });

    it("retrieves transfer by ID", async () => {
      const res = await request(app).get(`/api/transaction/${transferId}`);
      expect(res.status).toBe(200);
      expect(res.body.transaction.id).toBe(transferId);
      expect(res.body.transaction.status).toBe("pending");
      expect(res.body.transaction.sourceCountry.code).toBe("KEN");
      expect(res.body.transaction.claimAuthorization).toBe("operator_only");
      expect(res.body.transaction.isOperatorCustodied).toBe(true);
    });

    it("requires auth for claim", async () => {
      const res = await request(app)
        .post("/api/claim")
        .set("Idempotency-Key", "claim-no-auth")
        .send({ transferId });

      expect(res.status).toBe(401);
    });

    it("claims a transfer with authenticated receiver", async () => {
      const res = await request(app)
        .post("/api/claim")
        .set("Authorization", authHeader(getDeployerWallet()))
        .set("Idempotency-Key", "claim-success-1")
        .send({ transferId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transfer.status).toBe("claimed");
      expect(res.body.transfer.payout).toBeDefined();
      expect(res.body.transfer.payout.localCurrency).toBeDefined();
    });

    it("returns same response for same claim idempotency key", async () => {
      const first = await request(app)
        .post("/api/claim")
        .set("Authorization", authHeader(getDeployerWallet()))
        .set("Idempotency-Key", "claim-idem-1")
        .send({ transferId });

      const second = await request(app)
        .post("/api/claim")
        .set("Authorization", authHeader(getDeployerWallet()))
        .set("Idempotency-Key", "claim-idem-1")
        .send({ transferId });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.transfer.id).toBe(first.body.transfer.id);
      expect(second.body.transfer.payout.reference).toBe(first.body.transfer.payout.reference);
    });

    it("rejects claim from wrong wallet", async () => {
      const res = await request(app)
        .post("/api/claim")
        .set("Authorization", authHeader("SP3WRONG"))
        .set("Idempotency-Key", "claim-wrong-wallet")
        .send({ transferId });
      expect(res.status).toBe(403);
    });

    it("requires auth for wallet history", async () => {
      const res = await request(app).get("/api/transaction/wallet/SP1SENDER");
      expect(res.status).toBe(401);
    });

    it("rejects wallet history access for different wallet", async () => {
      const res = await request(app)
        .get("/api/transaction/wallet/SP1SENDER")
        .set("Authorization", authHeader("SP2RECEIVER"));
      expect(res.status).toBe(403);
    });

    it("retrieves wallet transaction history for owner", async () => {
      const res = await request(app)
        .get("/api/transaction/wallet/SP1SENDER")
        .set("Authorization", authHeader("SP1SENDER"));
      expect(res.status).toBe(200);
      expect(res.body.sent).toBeInstanceOf(Array);
      expect(res.body.received).toBeInstanceOf(Array);
    });
  });

  describe("crypto wallet claim flow", () => {
    const senderWallet = "SP12345678901234567890123456789012345678";
    const receiverWallet = "SP98765432109876543210987654321098765432";

    it("allows direct receiver claim for crypto wallet payouts", async () => {
      const sendRes = await request(app)
        .post("/api/send")
        .set("Authorization", authHeader(senderWallet))
        .set("Idempotency-Key", `send-crypto-${Date.now()}`)
        .send({
          receiverWallet,
          amountUsd: 15,
          sourceCountry: "GHA",
          destCountry: "KEN",
          payoutMethod: "crypto_wallet",
        });

      expect(sendRes.status).toBe(201);
      expect(sendRes.body.transfer.receiverWallet).toBe(receiverWallet);
      expect(sendRes.body.transfer.claimAuthorization).toBe("receiver_only");

      const claimRes = await request(app)
        .post("/api/claim")
        .set("Authorization", authHeader(receiverWallet))
        .set("Idempotency-Key", `claim-crypto-${Date.now()}`)
        .send({ transferId: sendRes.body.transfer.id });

      expect(claimRes.status).toBe(200);
      expect(claimRes.body.transfer.status).toBe("claimed");
    });
  });

  describe("Firestore production config enforcement", () => {
    it("throws when production mode has no Firebase admin credentials", () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalGoogleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const originalServiceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

      process.env.NODE_ENV = "production";
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

      expect(() => assertFirestoreConfigForProduction()).toThrow(
        "Firebase Admin is required in production"
      );

      process.env.NODE_ENV = originalNodeEnv;
      if (originalGoogleCreds !== undefined) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGoogleCreds;
      }
      if (originalServiceJson !== undefined) {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalServiceJson;
      }
    });
  });
});
