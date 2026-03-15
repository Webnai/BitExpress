import { expect, test } from "@playwright/test";

test("protected routes redirect unauthenticated users back home", async ({ page }) => {
  await page.goto("/send");

  await page.waitForURL("/");
  await expect(
    page.getByRole("heading", { name: /send money across africa instantly with bitcoin/i }),
  ).toBeVisible();
});
