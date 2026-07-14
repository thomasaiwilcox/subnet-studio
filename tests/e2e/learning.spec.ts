import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#world")).toBeVisible();
});

test("live CIDR lens follows the selected subnet", async ({ page }) => {
  await expect(page.locator("#lens-title")).toHaveText("192.168.1.0/24");
  await expect(page.locator("#prefix-ruler .network")).toHaveCount(24);
  await page.getByRole("button", { name: /192\.168\.1\.0\/24, 256 addresses/ }).click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: /192\.168\.1\.0\/26, 64 addresses/ }).click();
  await expect(page.locator("#lens-title")).toHaveText("192.168.1.0/26");
  await expect(page.locator("#prefix-ruler .network")).toHaveCount(26);
  await expect(page.locator("#prefix-ruler .host")).toHaveCount(6);
  await expect(page.locator("#metric-leaves")).toHaveText("4");
});

test("prefix playground explains /31 and /32 without mutating the workspace", async ({ page }) => {
  await page.getByRole("tab", { name: "Prefix" }).click();
  const slider = page.locator("#prefix-slider");
  await slider.fill("31");
  await expect(page.locator("#prefix-slider-value")).toHaveText("/31");
  await expect(page.locator("#prefix-lab-addresses")).toHaveText("2");
  await expect(page.locator("#prefix-lab-usable")).toHaveText("2");
  await expect(page.locator("#prefix-lab-host-bits")).toHaveText("1");
  await slider.fill("32");
  await expect(page.locator("#prefix-lab-addresses")).toHaveText("1");
  await expect(page.locator("#prefix-lab-usable")).toHaveText("1");
  await expect(page.locator("#envelope-label")).toHaveText("192.168.1.0/24");
});

test("planning examples preview exact inferred prefixes before commit", async ({ page }) => {
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Example: web + database" }).click();
  await expect(page.locator("#plan-preview")).toContainText("2 subnets will be allocated atomically");
  await expect(page.locator("#plan-preview")).toContainText("Web · /26");
  await expect(page.locator("#plan-preview")).toContainText("Database · /27");
  await expect(page.locator(".leaf.allocated")).toHaveCount(0);
});

test("guided lesson completes and restores the previous workspace", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: /192\.168\.1\.0\/24, 256 addresses/ }).click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("25");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".leaf")).toHaveCount(2);
  await page.getByRole("button", { name: /Learn by doing/ }).click();
  await page.getByRole("button", { name: /Turn one \/24 into four \/26s/ }).click();
  await expect(page.locator("#envelope-label")).toHaveText("192.168.10.0/24");
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(page.locator("#learn-panel")).toBeHidden();
  }
  await page.getByRole("button", { name: /192\.168\.10\.0\/24, 256 addresses/ }).click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  if (testInfo.project.name.startsWith("mobile") && !(await page.locator("#learn-panel").isVisible())) {
    await page.getByRole("button", { name: /Lesson active/ }).click();
  }
  await expect(page.locator("#lesson-steps li.complete")).toHaveCount(2);
  await page.getByRole("button", { name: "Exit & restore workspace" }).click();
  await expect(page.locator("#envelope-label")).toHaveText("192.168.1.0/24");
  await expect(page.locator(".leaf")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /192\.168\.1\.0\/25, 128 addresses/ })).toBeVisible();
});

test("aggregation and cloud-rule lessons validate real workspace actions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Curriculum smoke test runs once in Chromium");
  await page.getByRole("button", { name: /Learn by doing/ }).click();
  await page.getByRole("button", { name: /Join only half the address space/ }).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: /172\.16\.8\.0\/26, 64 addresses/ }).click();
  await page.getByRole("button", { name: /172\.16\.8\.64\/26, 64 addresses/ }).click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator("#lesson-steps li.complete")).toHaveCount(2);
  await page.getByRole("button", { name: "Exit & restore workspace" }).click();

  await page.getByRole("button", { name: /Plan inside AWS rules/ }).click();
  await page.getByLabel("Reserved address profile").selectOption("aws");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("Requests").fill("App: hosts=200");
  await page.getByRole("button", { name: "Allocate atomically" }).click();
  await expect(page.locator("#lesson-steps li.complete")).toHaveCount(2);
});
