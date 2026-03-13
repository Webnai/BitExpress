import request from "supertest";
import app from "../index";

describe("BitExpress API", () => {
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

    it("returns 404 for unsupported country", async () => {
      const res = await request(app).get("/api/exchange-rate/XYZ");
      expect(res.status).toBe(404);
    });

    it("converts USD to NGN", async () => {
      const res = await request(app)
        .post("/api/exchange-rate/convert")
        .send({ fromCurrency: "USD", toCurrency: "NGN", amount: 100 });
      expect(res.status).toBe(200);
      expect(res.body.toAmount).toBeGreaterThan(1000);
    });

    it("returns estimate for all countries", async () => {
      const res = await request(app).get("/api/exchange-rate/estimate/50");
      expect(res.status).toBe(200);
      expect(res.body.amountUsd).toBe(50);
      expect(res.body.estimates).toBeDefined();
    });
  });

  describe("POST /api/send", () => {
    it("creates a new transfer", async () => {
      const res = await request(app)
        .post("/api/send")
        .send({
          senderWallet: "SP1ABC...SENDER",
          receiverWallet: "SP2DEF...RECEIVER",
          amountUsd: 20,
          sourceCountry: "GHA",
          destCountry: "NGA",
          recipientPhone: "+2348012345678",
          recipientName: "John Doe",
          payoutMethod: "mobile_money",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.transfer.id).toBeDefined();
      expect(res.body.transfer.status).toBe("pending");
      expect(res.body.transfer.fee).toBeCloseTo(0.2, 5);
      expect(res.body.transfer.netAmount).toBeCloseTo(19.8, 5);
    });

    it("rejects invalid amount", async () => {
      const res = await request(app)
        .post("/api/send")
        .send({
          senderWallet: "SP1ABC",
          receiverWallet: "SP2DEF",
          amountUsd: 0,
          sourceCountry: "GHA",
          destCountry: "NGA",
        });
      expect(res.status).toBe(400);
    });

    it("rejects unsupported country", async () => {
      const res = await request(app)
        .post("/api/send")
        .send({
          senderWallet: "SP1ABC",
          receiverWallet: "SP2DEF",
          amountUsd: 20,
          sourceCountry: "USA",
          destCountry: "NGA",
        });
      expect(res.status).toBe(400);
    });

    it("rejects missing required fields", async () => {
      const res = await request(app)
        .post("/api/send")
        .send({ amountUsd: 20 });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/claim + GET /api/transaction", () => {
    let transferId: string;

    beforeEach(async () => {
      // Create a transfer first
      const sendRes = await request(app)
        .post("/api/send")
        .send({
          senderWallet: "SP1SENDER",
          receiverWallet: "SP2RECEIVER",
          amountUsd: 50,
          sourceCountry: "KEN",
          destCountry: "NGA",
          recipientPhone: "+2349012345678",
          recipientName: "Jane Smith",
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
    });

    it("returns 404 for non-existent transaction", async () => {
      const res = await request(app).get("/api/transaction/non-existent-id");
      expect(res.status).toBe(404);
    });

    it("claims a transfer", async () => {
      const res = await request(app)
        .post("/api/claim")
        .send({
          transferId,
          receiverWallet: "SP2RECEIVER",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transfer.status).toBe("claimed");
      expect(res.body.transfer.payout).toBeDefined();
      expect(res.body.transfer.payout.localCurrency).toBeDefined();
    });

    it("rejects duplicate claim", async () => {
      // Claim once
      await request(app)
        .post("/api/claim")
        .send({ transferId, receiverWallet: "SP2RECEIVER" });

      // Try to claim again
      const res = await request(app)
        .post("/api/claim")
        .send({ transferId, receiverWallet: "SP2RECEIVER" });

      expect(res.status).toBe(400);
    });

    it("rejects claim from wrong wallet", async () => {
      const res = await request(app)
        .post("/api/claim")
        .send({ transferId, receiverWallet: "SP3WRONG" });
      expect(res.status).toBe(403);
    });

    it("retrieves wallet transaction history", async () => {
      const res = await request(app).get("/api/transaction/wallet/SP1SENDER");
      expect(res.status).toBe(200);
      expect(res.body.sent).toBeInstanceOf(Array);
      expect(res.body.received).toBeInstanceOf(Array);
    });
  });
});
