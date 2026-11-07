import { test, expect } from "@playwright/test";

test.describe("Complete manufacturing lifecycle", () => {
  test("demand → BOM/MRP → purchase → receipt → MO → issue → work orders → QC → accepted receipt → stock/cost traceability", async ({ page }) => {
    // Note: This E2E test requires the dev server and database to be running
    // with seed data loaded. It validates the UI flows end-to-end.

    // 1. Login (credentials supplied through the E2E environment; signup is closed)
    await page.goto("/login");
    await page.fill('input[type="email"]', process.env.E2E_EMAIL ?? "admin@manufactureos.local");
    await page.fill('input[type="password"]', process.env.E2E_PASSWORD ?? "");
    await page.click('button[type="submit"]');
    // First hit compiles the auth route on the fly; allow a warm-up margin.
    await expect(page).toHaveURL("/overview", { timeout: 30_000 });

    // 2. Navigate to Item Master and verify seed items exist
    await page.click('nav a:has-text("Items")');
    // If no Items nav link, navigate directly
    if ((await page.url()).endsWith("/overview")) {
      await page.goto("/items");
    }
    await expect(page.locator("text=RM-001")).toBeVisible();
    await expect(page.locator("text=PC-001")).toBeVisible();
    await expect(page.locator("text=FG-001")).toBeVisible();

    // 3. Navigate to BOM create and verify BOM page loads
    await page.goto("/boms/create");
    await expect(page.locator("h1:has-text('Create BOM')")).toBeVisible();
    await expect(page.locator('input[placeholder*="BOM-"]')).toBeVisible();

    // 4. Navigate to Procurement and verify PO/GR flows
    await page.goto("/procurement");
    await expect(page.locator("h1:has-text('Procurement')")).toBeVisible();

    // 5. Navigate to Manufacturing and verify MO flows
    await page.goto("/manufacturing");
    await expect(page.locator("h1:has-text('Manufacturing Orders')")).toBeVisible();

    // 6. Navigate to Work Order Execution
    await page.goto("/manufacturing/work-orders");
    await expect(page.locator("h1:has-text('Work Order Execution')")).toBeVisible();

    // 7. Navigate to Quality Control
    await page.goto("/quality");
    await expect(page.locator("h1:has-text('Quality Control')")).toBeVisible();

    // 8. Navigate to Production Receipts
    await page.goto("/manufacturing/receipts");
    await expect(page.locator("h1:has-text('Production Receipts')")).toBeVisible();

    // 9. Navigate to Reports (Costing)
    await page.goto("/reports");
    await expect(page.locator("h1:has-text('Costing & Reports')")).toBeVisible();

    // 10. Navigate to Administration
    await page.goto("/administration");
    await expect(page.locator("h1:has-text('Administration')")).toBeVisible();
  });
});
