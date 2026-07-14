import { expect, test } from "@playwright/test";

test("mobile layout has no horizontal page overflow and uses a bottom-sheet inspector", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only layout assertion");
  await page.goto("/");
  await page.getByRole("button", { name: /192\.168\.1\.0\/24, 256 addresses/ }).click();
  const details = page.locator("#details-panel");
  await expect(details).toBeVisible();
  const metrics = await page.evaluate(() => {
    const panel = document.getElementById("details-panel")!.getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelLeft: panel.left,
      panelRight: panel.right,
      viewportWidth: innerWidth,
      panelBottom: panel.bottom,
      viewportHeight: innerHeight,
    };
  });
  expect(metrics.bodyOverflow).toBeLessThanOrEqual(1);
  expect(metrics.panelLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.panelRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
});

test("explicit select mode makes partial join touch-friendly", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only workflow");
  await page.goto("/");
  await page.getByRole("button", { name: /192\.168\.1\.0\/24, 256 addresses/ }).click();
  await page.getByRole("button", { name: "Split subnet" }).click();
  await page.getByLabel("New prefix").selectOption("26");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: /192\.168\.1\.0\/26, 64 addresses/ }).tap();
  await page.getByRole("button", { name: /192\.168\.1\.64\/26, 64 addresses/ }).tap();
  await expect(page.getByRole("button", { name: "Join", exact: true })).toBeEnabled();
});

test("touch pointers pan and pinch-zoom the subnet canvas", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Touch-only workflow");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const viewport = page.locator("#viewport");
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + Math.min(100, box!.width / 3);
  const y = box!.y + Math.min(100, box!.height / 3);
  const pointer = (pointerId: number, clientX: number, clientY: number, buttons: number) => ({
    pointerId, pointerType: "touch", isPrimary: pointerId === 1, clientX, clientY, button: 0, buttons,
  });

  await page.getByRole("button", { name: "Pan", exact: true }).click();
  await viewport.dispatchEvent("pointerdown", pointer(1, x, y, 1));
  await viewport.dispatchEvent("pointermove", pointer(1, x + 36, y + 24, 1));
  await viewport.dispatchEvent("pointerup", pointer(1, x + 36, y + 24, 0));
  await expect(page.locator("#world")).not.toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");

  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  await viewport.dispatchEvent("pointerdown", pointer(1, x, y, 1));
  await viewport.dispatchEvent("pointerdown", pointer(2, x + 70, y, 1));
  await viewport.dispatchEvent("pointermove", pointer(2, x + 130, y, 1));
  const transform = await page.locator("#world").evaluate((element) => getComputedStyle(element).transform);
  expect(transform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  await viewport.dispatchEvent("pointerup", pointer(2, x + 130, y, 0));
  await viewport.dispatchEvent("pointerup", pointer(1, x, y, 0));
  expect(pageErrors).toEqual([]);
});

test("learning panel fits the viewport and collapses for practice", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only learning layout");
  await page.goto("/");
  await page.getByRole("button", { name: /Learn by doing/ }).click();
  const panel = page.locator("#learn-panel");
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1);
  await page.getByRole("button", { name: /Turn one \/24 into four \/26s/ }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: /Lesson active/ })).toBeVisible();
});
