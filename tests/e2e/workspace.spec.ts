import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#world")).toBeVisible();
});

test("splits, partially joins, then preserves exact undo and redo", async ({ page }) => {
  await page.getByRole("button", { name: /192\.168\.1\.0\/24, 256 addresses/ }).click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.getByRole("button", { name: "Split", exact: true }).click();

  await expect(page.locator(".leaf")).toHaveCount(4);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: /192\.168\.1\.0\/26, 64 addresses/ }).click();
  await page.getByRole("button", { name: /192\.168\.1\.64\/26, 64 addresses/ }).click();
  await expect(page.getByRole("button", { name: "Join", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Join", exact: true }).click();

  await expect(page.locator(".leaf")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /192\.168\.1\.0\/25, 128 addresses/ })).toBeVisible();
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.locator(".leaf")).toHaveCount(4);
  await page.getByRole("button", { name: /Redo/ }).click();
  await expect(page.locator(".leaf")).toHaveCount(3);
});

test("plans atomically and renders hostile labels as inert text", async ({ page }) => {
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  const hostile = '<img src=x onerror="globalThis.pwned=true">';
  await page.getByLabel("Requests").fill(`${hostile}: /26 x2\nDatabase: hosts=20`);
  await page.getByRole("button", { name: "Allocate atomically" }).click();

  await expect(page.getByRole("cell", { name: hostile, exact: true })).toHaveCount(2);
  await expect(page.locator("#subnet-table-body img")).toHaveCount(0);
  await expect(page.evaluate(() => (globalThis as typeof globalThis & { pwned?: boolean }).pwned)).resolves.toBeUndefined();
  await expect(page.locator(".leaf.allocated")).toHaveCount(3);

  const allocated = page.locator(".leaf.allocated").first();
  await allocated.click();
  await expect(page.getByRole("button", { name: "Split subnet" })).toBeDisabled();
  await page.getByRole("button", { name: "Deallocate subnet" }).click();
  await expect(page.locator(".leaf.allocated")).toHaveCount(2);
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.locator(".leaf.allocated")).toHaveCount(3);
});

test("enforces cloud profile prefix boundaries", async ({ page }) => {
  await page.getByLabel("Reserved address profile").selectOption("azure");
  await expect(page.getByLabel("Find fit").locator("option[value='29']")).toHaveCount(1);
  await expect(page.getByLabel("Find fit").locator("option[value='30']")).toHaveCount(0);

  await page.getByRole("button", { name: "Address", exact: true }).click();
  await page.getByLabel("Address space (CIDR)").fill("10.0.0.0/30");
  await page.getByRole("button", { name: "Set address space" }).click();
  await expect(page.getByRole("alert")).toContainText("prefix limits /2–/29");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByLabel("Reserved address profile").selectOption("gcp");
  await expect(page.getByLabel("Reserved address profile")).toHaveValue("gcp");
});

test("exports safe SVG and CSV leaf data", async ({ page }) => {
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("Requests").fill('<img src=x onerror="globalThis.pwned=true">: /26');
  await page.getByRole("button", { name: "Allocate atomically" }).click();
  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ▾" }).click();
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svg = await svgDownload;
  expect(svg.suggestedFilename()).toBe("subnets.svg");
  const svgPath = await svg.path();
  expect(svgPath).not.toBeNull();
  const svgText = await readFile(svgPath!, "utf8");
  expect(svgText).not.toContain("<img");
  expect(svgText).toContain("&lt;img");

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ▾" }).click();
  await page.getByRole("button", { name: "Export PNG" }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toBe("subnets.png");
  const pngPath = await png.path();
  expect(pngPath).not.toBeNull();
  expect((await readFile(pngPath!)).subarray(1, 4).toString()).toBe("PNG");

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ▾" }).click();
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await csvDownload).suggestedFilename()).toBe("subnets.csv");
});

test("returns focus to the control that opened a dialog", async ({ page }) => {
  const plan = page.getByRole("button", { name: "Plan", exact: true });
  await plan.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(plan).toBeFocused();
});

test("reset view restores the exact identity transform", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "Wheel zoom is a desktop interaction");
  const viewport = page.locator("#viewport");
  await viewport.hover();
  await page.mouse.wheel(0, -300);
  await expect(page.locator("#world")).not.toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(page.locator("#world")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
});

test("desktop mouse drag pans directly and in dedicated Pan mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "Mouse-only workflow");
  const viewport = page.locator("#viewport");
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#world")).not.toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");

  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pan", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#world")).not.toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
});

test("share state round-trips allocations and Unicode labels", async ({ page }) => {
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByLabel("Requests").fill("München – 数据: /26");
  await page.getByRole("button", { name: "Allocate atomically" }).click();
  await page.getByRole("button", { name: "Share ▾" }).click();
  await page.getByRole("button", { name: "Copy share link" }).click();
  const url = page.url();
  expect(url).toContain("#state=");
  await page.goto(url);
  await page.getByRole("tab", { name: "Subnets" }).click();
  await expect(page.getByRole("cell", { name: "München – 数据" })).toBeVisible();
  await expect(page.locator(".leaf.allocated")).toHaveCount(1);
});
