import { expect, test } from "@playwright/test";

test("desktop dark and light workspaces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One stable desktop snapshot target");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Subnet Studio" })).toBeVisible();
  await expect(page).toHaveScreenshot("desktop-dark.png", { fullPage: true, maxDiffPixels: 50 });

  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page).toHaveScreenshot("desktop-light.png", { fullPage: true, maxDiffPixels: 50 });
});

test("mobile inspector and ghost-planning bottom sheets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "One stable mobile snapshot target");
  await page.goto("/");
  await page.getByRole("button", { name: /192\.168\.1\.0\/24, 256 addresses/ }).click();
  await expect(page.locator("#details-panel")).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-inspector.png", { fullPage: true });

  await page.getByRole("button", { name: "Close subnet details" }).click();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("Requests").fill("Web: hosts=50\nData: hosts=20");
  await expect(page.locator("#dock-plan-panel")).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-planning.png", { fullPage: true });
});

test("Join mode and analysis publication states", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One stable desktop snapshot target");
  await page.goto("/");
  await page.locator(".leaf").click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.locator("#split-form button[type=submit]").click();
  await page.getByRole("button", { name: "Select" }).click();
  await page.locator(".leaf").first().click();
  await page.locator("#join-candidates button").first().focus();
  await expect(page.locator(".leaf.candidate")).toHaveCount(2);
  await expect(page).toHaveScreenshot("desktop-join-mode.png", { maxDiffPixels: 50 });
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.locator(".scenario-card").filter({ hasText: "Small office" }).getByRole("button", { name: "Load scenario" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Analyse" }).click();
  await expect(page).toHaveScreenshot("desktop-analysis.png", { maxDiffPixels: 50 });
});

test("first-run walkthrough", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One stable desktop snapshot target");
  await page.goto("/");
  await page.evaluate(() => { localStorage.removeItem("subnet-studio-walkthrough-v1"); localStorage.removeItem("subnet-studio-autosave-v1"); });
  await page.reload();
  await expect(page.locator("#walkthrough-dialog")).toBeVisible();
  await expect(page).toHaveScreenshot("desktop-walkthrough.png", { maxDiffPixels: 50 });
});

test("guided learning panel on desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One stable desktop snapshot target");
  await page.goto("/");
  await page.getByRole("button", { name: /Learn by doing/ }).click();
  await expect(page.locator("#learn-panel")).toBeVisible();
  await expect(page).toHaveScreenshot("desktop-learning.png", { maxDiffPixels: 50 });
});

test("guided learning panel on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "One stable mobile snapshot target");
  await page.goto("/");
  await page.getByRole("button", { name: /Learn by doing/ }).click();
  await expect(page.locator("#learn-panel")).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-learning.png", { maxDiffPixels: 50 });
});
