import { expect, test } from "@playwright/test";

test("landing page renders the primary marketing content", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /send money across africa instantly with bitcoin/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  await expect(page.getByText(/bitcoin-powered remittance rail/i)).toBeVisible();
});
