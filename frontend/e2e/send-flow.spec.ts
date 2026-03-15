import { expect, test } from "@playwright/test";

const senderAddress = "ST22XTWYXH14VK7SQYEAMKRKRS9BZ32QXJPQNZ7FN";
const receiverAddress = "STMZ6JMQYH7MJN6EKXRS696XT8JH6XB20F4HPG9D";
const mockSendTxId = "e2e-send-txid";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ wallet, txid }) => {
      window.__BITEXPRESS_E2E__ = {
        wallet,
        authToken: "bitexpress-e2e-auth-token",
        txids: {
          send: txid,
          claim: "e2e-claim-txid",
          refund: "e2e-refund-txid",
        },
      };

      window.localStorage.setItem("bitexpress.wallet", JSON.stringify(wallet));
    },
    {
      wallet: { address: senderAddress, walletName: "Leather" },
      txid: mockSendTxId,
    },
  );

  await page.route("http://localhost:4000/api/exchange-rate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rates: {
          GHA: {
            from: "USD",
            to: "GHS",
            rate: 15,
            btcUsdPrice: 65000,
            updatedAt: new Date().toISOString(),
          },
        },
        supportedCountries: [
          {
            code: "GHA",
            name: "Ghana",
            currency: "GHS",
            currencySymbol: "₵",
            mobileMoney: "MTN, Vodafone Cash, AirtelTigo",
            supportsMobileMoneyPayout: true,
            mobileMoneyProvider: "paystack",
            mobileMoneyOperators: [
              { code: "MTN", label: "MTN MoMo", provider: "paystack" },
            ],
            flag: "🇬🇭",
          },
        ],
      }),
    });
  });

  await page.route("http://localhost:4000/api/transaction/wallet/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sent: [], received: [] }),
    });
  });

  await page.route("https://api.testnet.hiro.so/extended/v1/address/**/balances", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stx: {
          balance: "1000000",
          total_sent: "0",
          total_received: "1000000",
        },
        fungible_tokens: {},
      }),
    });
  });

  await page.route("http://localhost:4000/api/send", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;

    expect(body.receiverWallet).toBe(receiverAddress);
    expect(body.amountUsd).toBe(1);
    expect(body.sourceCountry).toBe("GHA");
    expect(body.destCountry).toBe("GHA");
    expect(body.recipientMobileProvider).toBe("MTN");
    expect(body.stacksTxId).toBe(mockSendTxId);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        transfer: {
          id: "transfer-e2e-001",
          status: "pending",
          onChainTransferId: 1,
          amount: 1,
          fee: 0.01,
          netAmount: 0.99,
          sourceCountry: "GHA",
          destCountry: "GHA",
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });
});

test("authenticated user can complete the mocked send flow", async ({ page }) => {
  await page.goto("/send");

  await expect(page.getByRole("heading", { name: /send money/i })).toBeVisible();

  await page.locator("select").nth(1).selectOption("GHA");
  await page.getByPlaceholder("+233 24 123 4567").fill("+233542422691");
  await page.getByPlaceholder("Kwame Mensah").fill("Test Receiver");
  await page.getByPlaceholder("SP...").fill(receiverAddress);
  await page.locator('input[inputmode="decimal"]').fill("1");

  await page.getByRole("button", { name: /^send money$/i }).click();

  await expect(page.getByText(/transfer created successfully/i)).toBeVisible();
  await expect(page.getByText(/transfer-e2e-001/i)).toBeVisible();
});
