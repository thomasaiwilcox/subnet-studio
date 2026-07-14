import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#world")).toBeVisible();
});

test("contextual actions allocate a leaf and guided Join mode offers valid aggregates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Interaction detail runs once in Chromium");
  await page.locator(".leaf").click();
  await expect(page.locator("#map-actions")).toBeVisible();
  await page.getByRole("button", { name: "Allocate", exact: true }).click();
  await page.locator("#allocation-label").fill("Staff <literal>");
  await page.getByLabel(/Requested hosts/).fill("100");
  await page.locator("#allocation-form button[type=submit]").click();
  await expect(page.locator(".leaf.allocated")).toHaveCount(1);
  await page.locator(".leaf").click();
  await page.getByRole("button", { name: "Deallocate", exact: true }).click();
  await page.locator(".leaf").click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.locator("#split-form button[type=submit]").click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator(".leaf").first().click();
  await expect(page.locator("#join-candidates")).toContainText("4 leaves → 192.168.1.0/24");
  await page.locator("#join-candidates button").filter({ hasText: "4 leaves" }).click();
  await expect(page.getByRole("button", { name: "Join", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator(".leaf")).toHaveCount(1);
});

test("ghost planning, Subnet Coach and Apply use one exact transaction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Interaction detail runs once in Chromium");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("Requests").fill("Web: hosts=50\nData: hosts=20");
  await expect(page.locator(".leaf.preview-proposed")).toHaveCount(2);
  await expect(page.locator(".leaf.allocated")).toHaveCount(0);
  await page.getByRole("button", { name: "Explain this plan" }).click();
  await expect(page.locator("#coach-title")).toHaveText("Read the requirements");
  for (let index = 0; index < 5; index += 1) await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#coach-title")).toHaveText("Review efficiency");
  await page.getByRole("button", { name: "Allocate atomically" }).click();
  await expect(page.locator(".leaf.allocated")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Subnets" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#activity-log")).toContainText("Applied plan for 2 subnets");
});

test("history preview restores an earlier point and preserves redo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Pointer hover preview runs once in Chromium");
  await page.locator(".leaf").click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.locator("#split-form button[type=submit]").click();
  const start = page.locator("#activity-log button").first();
  await start.hover();
  await expect(page.locator("#history-preview-banner")).toBeVisible();
  await expect(page.locator(".leaf")).toHaveCount(1);
  await start.click();
  await expect(page.locator(".leaf")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
});

test("autosave recovers the committed workspace and ignores transient planning", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Storage recovery runs once in Chromium");
  await page.locator(".leaf").click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.locator("#split-form button[type=submit]").click();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("Requests").fill("Ghost only: /28");
  await expect(page.locator(".leaf.preview-proposed")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".leaf")).toHaveCount(4);
  await expect(page.locator(".leaf.allocated")).toHaveCount(0);
  await expect(page.locator("#toast")).toContainText("Recovered local autosave");
});

test("scenario loading and safe standalone report export", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Downloads run once in Chromium");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.locator(".scenario-card").filter({ hasText: "Small office" }).getByRole("button", { name: "Load scenario" }).click();
  await expect(page.locator("#envelope-label")).toHaveText("192.168.10.0/24");
  await page.getByRole("tab", { name: "Analyse" }).click();
  await expect(page.locator("#analysis-groups")).toContainText("Staff");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ▾" }).click();
  await page.getByRole("button", { name: "Offline HTML report" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("subnet-studio-report.html");
  const path = await file.path();
  expect(path).not.toBeNull();
  const html = await readFile(path!, "utf8");
  expect(html).toContain("Canonical subnet map");
  expect(html).not.toContain("<script");
  expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//);
});

test("first-run walkthrough is focusable, skippable and persistent", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Onboarding runs once in Chromium");
  await page.evaluate(() => { localStorage.removeItem("subnet-studio-walkthrough-v1"); localStorage.removeItem("subnet-studio-autosave-v1"); });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Start with an address space" })).toBeVisible();
  await expect(page.locator("#walkthrough-next")).toBeFocused();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#walkthrough-title")).toHaveText("Work directly on the map");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.reload();
  await expect(page.locator("#walkthrough-dialog")).not.toBeVisible();
});

test("mobile planning is a bounded bottom sheet without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only layout assertion");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("Requests").fill("Web: hosts=50");
  await expect(page.locator("#dock-plan-panel")).toBeVisible();
  const metrics = await page.evaluate(() => {
    const panel = document.getElementById("dock-plan-panel")!.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, left: panel.left, right: panel.right, width: innerWidth, bottom: panel.bottom, height: innerHeight };
  });
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.height + 1);
});
